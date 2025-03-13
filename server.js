const express = require('express');
const mongoose = require('mongoose');
const Pusher = require('pusher');
const cors = require('cors');
require('dotenv').config();
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// Serve static files from the root directory
app.use(express.static(path.join(__dirname)));

// MongoDB connection
const uri = process.env.MONGODB_URI || "mongodb+srv://chatuser:securepassword123@chatroulette-lite-clust.amhu0.mongodb.net/?retryWrites=true&w=majority&appName=chatroulette-lite-cluster";
mongoose.connect(uri)
    .then(() => console.log('MongoDB Atlas connected successfully'))
    .catch(err => {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    });

// Pusher setup
const pusher = new Pusher({
    appId: process.env.PUSHER_APP_ID,
    key: process.env.PUSHER_KEY,
    secret: process.env.PUSHER_SECRET,
    cluster: process.env.PUSHER_CLUSTER,
    useTLS: true
});

const User = require('./models/User');

// In-memory store for recent messages (simple deduplication, could be replaced with MongoDB)
const recentMessages = new Set();

const Message = mongoose.model('Message', new mongoose.Schema({
    text: String,
    from: String,
    to: String,
    messageId: String,
    timestamp: { type: Date, default: Date.now }
}));

// API endpoints
app.get('/api/users/nearby', async (req, res) => {
    const { latitude, longitude, radius = 5000, topics, language, ageRange } = req.query;
    try {
        console.log('Query params:', { latitude, longitude, radius, topics, language, ageRange });
        let matchQuery = {
            $geoNear: {
                near: { type: 'Point', coordinates: [parseFloat(longitude), parseFloat(latitude)] },
                distanceField: 'dist.calculated',
                maxDistance: parseInt(radius),
                spherical: true
            }
        };

        if (topics) matchQuery.$match = { 'preferences.topics': { $in: topics.split(',') } };
        if (language) matchQuery.$match = { 'preferences.language': language };
        if (ageRange) {
            const [min, max] = ageRange.split('-').map(Number);
            matchQuery.$match = { ...matchQuery.$match, 'preferences.ageRange.min': { $lte: max }, 'preferences.ageRange.max': { $gte: min } };
        }

        console.log('Aggregation query:', matchQuery);
        const nearbyUsers = await User.aggregate([matchQuery]);
        console.log('Query result:', nearbyUsers);
        res.json(nearbyUsers);
    } catch (error) {
        console.error('Error in /api/users/nearby:', error.stack);
        res.status(500).json({ error: 'Error fetching nearby users', details: error.message });
    }
});

app.delete('/api/user/location', async (req, res) => {
    await User.deleteMany({});
    pusher.trigger('presence-channel', 'user-location-revoked', {});
    res.json({ success: true });
});

app.get('/api/user/dashboard', async (req, res) => {
    const userId = req.query.userId;
    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({
            locationHistory: user.location,
            onlineStatus: user.online,
            preferences: user.preferences,
            sharedAt: user.createdAt
        });
    } catch (error) {
        res.status(500).json({ error: 'Error fetching dashboard data' });
    }
});

app.post('/api/user/update-preferences', async (req, res) => {
    const { userId, preferences } = req.body;
    try {
        const updatedUser = await User.findByIdAndUpdate(userId, { preferences }, { new: true });
        res.json(updatedUser);
    } catch (error) {
        res.status(500).json({ error: 'Error updating preferences' });
    }
});

app.post('/message', async (req, res) => {
    const { text, from, to, messageId } = req.body;
    console.log('Received message:', { text, from, to, messageId });

    // Deduplication check
    if (messageId && recentMessages.has(messageId)) {
        console.log('Duplicate message detected, skipping:', messageId);
        return res.sendStatus(200);
    }

    try {
        // Store message in MongoDB (optional, for persistence)
        await Message.create({ text, from, to, messageId });

        // Trigger Pusher event
        pusher.trigger('chat-channel', 'message', { text, from, to, messageId }, (error) => {
            if (error) {
                console.error('Pusher trigger error:', error);
                return res.status(500).json({ error: 'Failed to trigger Pusher event' });
            }
        });

        // Add to recent messages set for deduplication
        if (messageId) recentMessages.add(messageId);

        // Clean up old messages (keep last 100 unique messages)
        if (recentMessages.size > 100) {
            const iterator = recentMessages.values();
            for (let i = 0; i < recentMessages.size - 100; i++) {
                recentMessages.delete(iterator.next().value);
            }
        }

        res.sendStatus(200);
    } catch (error) {
        console.error('Error processing message:', error.stack);
        res.status(500).json({ error: 'Error processing message', details: error.message });
    }
});

app.post('/api/user/toggle-location', async (req, res) => {
    const { userId, shareLocation } = req.body;
    try {
        const updatedUser = await User.findByIdAndUpdate(userId, { location: shareLocation ? user.location : null }, { new: true });
        res.json(updatedUser);
    } catch (error) {
        res.status(500).json({ error: 'Error toggling location sharing' });
    }
});

// Handle /api/connect without authentication (temporary)
app.post('/api/connect/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        console.log('Pusher config:', {
            appId: process.env.PUSHER_APP_ID,
            key: process.env.PUSHER_KEY,
            secret: process.env.PUSHER_SECRET,
            cluster: process.env.PUSHER_CLUSTER
        });
        const targetUser = await User.findById(userId);
        if (!targetUser || !targetUser.online) {
            return res.status(404).json({ error: 'User not found or offline' });
        }
        // Simulate pairing
        pusher.trigger('chat-channel', 'pair', { initiator: req.body.from || 'you', target: userId });
        console.log('Pusher trigger succeeded for user:', userId);
        res.json({ success: true, pairedWith: userId });
    } catch (error) {
        console.error('Error in /api/connect:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Handle root route to serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));