const express = require('express');
const mongoose = require('mongoose');
const Pusher = require('pusher');
const cors = require('cors');
require('dotenv').config();
const path = require('path');

const app = express();

// Debug log to confirm server version
console.log('Starting ChatRoulette Lite server - Version with /pusher/auth endpoint');

// Middleware
app.use(express.json());

// Configure CORS to allow requests from specific origins
app.use(cors({
    origin: (origin, callback) => {
        const allowedOrigins = ['http://127.0.0.1:8080', 'https://chatroulette-lite.onrender.com'];
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 204 // Ensure preflight requests return 204
}));

// Serve static files from the root directory
app.use(express.static(path.join(__dirname)));

// MongoDB connection
const uri = process.env.MONGODB_URI || "mongodb+srv://chatuser:securepassword123@chatroulette-lite-clust.amhu0.mongodb.net/?retryWrites=true&w=majority&appName=chatroulette-lite-cluster";
mongoose.connect(uri, {
    serverSelectionTimeoutMS: 30000,
    heartbeatFrequencyMS: 10000
})
    .then(() => console.log('MongoDB Atlas connected successfully'))
    .catch(err => {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    });

// Pusher setup
const pusher = new Pusher({
    appId: process.env.PUSHER_APP_ID || '1949423',
    key: process.env.PUSHER_KEY || 'b14541edb68153cc4354',
    secret: process.env.PUSHER_SECRET || '069c676bfc3c462743af',
    cluster: process.env.PUSHER_CLUSTER || 'ap2',
    useTLS: true
});

// User Schema
const userSchema = new mongoose.Schema({
    preferredName: String,
    location: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], default: [0, 0] }
    },
    preferences: {
        topics: { type: [String], default: [] },
        ageRange: {
            min: { type: Number, default: 18 },
            max: { type: Number, default: 99 }
        }
    },
    online: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

userSchema.index({ location: '2dsphere' });

const User = mongoose.model('User', userSchema);

// Message Schema
const messageSchema = new mongoose.Schema({
    text: String,
    from: String,
    to: String,
    messageId: String,
    timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);

// In-memory store for recent messages (for deduplication)
const recentMessages = new Set();

// Pusher Authentication Endpoint
app.post('/pusher/auth', (req, res) => {
    console.log('Pusher auth request received:', req.body);
    const socketId = req.body.socket_id;
    const channelName = req.body.channel_name;
    const userId = req.body.user_id || 'anonymous';

    const presenceData = {
        user_id: userId,
        user_info: {
            name: userId === 'anonymous' ? 'Anonymous' : userId
        }
    };

    try {
        const authResponse = pusher.authenticate(socketId, channelName, presenceData);
        res.json(authResponse);
    } catch (error) {
        console.error('Pusher auth error:', error);
        res.status(500).json({ error: 'Pusher authentication failed', details: error.message });
    }
});

// API Endpoints

// Fetch nearby users based on geolocation
app.get('/api/users/nearby', async (req, res) => {
    try {
        const { latitude, longitude, radius } = req.query;
        if (!latitude || !longitude || !radius) {
            return res.status(400).json({ error: 'Latitude, longitude, and radius are required' });
        }

        const users = await User.aggregate([
            {
                $geoNear: {
                    near: { type: 'Point', coordinates: [parseFloat(longitude), parseFloat(latitude)] },
                    distanceField: 'dist.calculated',
                    maxDistance: parseFloat(radius),
                    spherical: true
                }
            },
            {
                $match: { online: true }
            }
        ]);

        res.json(users.map(user => ({
            _id: user._id,
            preferredName: user.preferredName || 'Anonymous',
            preferences: user.preferences,
            dist: user.dist
        })));
    } catch (error) {
        console.error('Error fetching nearby users:', error);
        res.status(500).json({ error: 'Error fetching nearby users', details: error.message });
    }
});

// Revoke location data
app.delete('/api/user/location', async (req, res) => {
    try {
        await User.deleteMany({});
        pusher.trigger('presence-channel', 'user-location-revoked', {});
        res.json({ success: true });
    } catch (error) {
        console.error('Error revoking location:', error);
        res.status(500).json({ error: 'Error revoking location', details: error.message });
    }
});

// Fetch user dashboard data
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
        console.error('Error fetching dashboard data:', error);
        res.status(500).json({ error: 'Error fetching dashboard data', details: error.message });
    }
});

// Update user preferences
app.post('/api/user/update-preferences', async (req, res) => {
    const { userId, preferences } = req.body;
    try {
        if (!userId || !preferences) {
            return res.status(400).json({ error: 'userId and preferences are required' });
        }
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { preferences },
            { new: true }
        );
        if (!updatedUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ success: true, message: 'Preferences updated', preferences: updatedUser.preferences });
    } catch (error) {
        console.error('Error updating preferences:', error);
        res.status(500).json({ error: 'Error updating preferences', details: error.message });
    }
});

// Handle message sending and broadcasting via Pusher
app.post('/message', async (req, res) => {
    console.log('Received /message request:', req.body); // Debug log
    const { text, from, to, messageId } = req.body;

    if (messageId && recentMessages.has(messageId)) {
        console.log('Duplicate message detected, skipping:', messageId);
        return res.sendStatus(200);
    }

    try {
        const message = await Message.create({ text, from, to, messageId });

        pusher.trigger('chat-channel', 'message', { text, from, to, messageId }, (error) => {
            if (error) {
                console.error('Pusher trigger error:', error);
                return res.status(500).json({ error: 'Failed to trigger Pusher event', details: error.message });
            }
        });

        if (messageId) recentMessages.add(messageId);

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

// Connect to a user
app.post('/api/connect/:userId', async (req, res) => {
    console.log('Received connect request:', req.params, req.body);
    try {
        const { userId } = req.params;
        const { preferredName } = req.body;

        if (!preferredName) {
            console.log('Missing preferredName in request body');
            return res.status(400).json({ error: 'Preferred name is required' });
        }

        const user = await User.findByIdAndUpdate(
            userId,
            {
                preferredName,
                online: true,
                location: { type: 'Point', coordinates: req.body.location?.coordinates || [0, 0] },
                preferences: { topics: ['chat'], ageRange: { min: 18, max: 99 } }
            },
            { new: true, upsert: true }
        );

        const otherUser = await User.findOne({ _id: { $ne: userId }, online: true });

        pusher.trigger(`presence-chat-${userId}`, 'connection', {
            connectedUserId: otherUser ? otherUser._id : null,
            connectedUserName: otherUser ? otherUser.preferredName || 'Anonymous' : 'Anonymous'
        });

        res.json({
            success: true,
            otherUserName: otherUser ? otherUser.preferredName || 'Anonymous' : 'Anonymous',
            otherUserId: otherUser ? otherUser._id : null
        });
    } catch (error) {
        console.error('Error connecting:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Handle root route to serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Handle chat.html route explicitly
app.get('/chat.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'chat.html'));
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));