const express = require('express');
const mongoose = require('mongoose');
const Pusher = require('pusher');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

const uri = process.env.MONGODB_URI || "mongodb+srv://chatuser:securepassword123@chatroulette-lite-clust.amhu0.mongodb.net/?retryWrites=true&w=majority&appName=chatroulette-lite-cluster";
mongoose.connect(uri)
    .then(() => console.log('MongoDB Atlas connected successfully'))
    .catch(err => {
        console.error('MongoDB connection error:', {
            message: err.message,
            name: err.name,
            code: err.code,
            syscall: err.syscall,
            hostname: err.hostname
        });
        process.exit(1);
    });

const pusher = new Pusher({
    appId: process.env.PUSHER_APP_ID,
    key: process.env.PUSHER_KEY,
    secret: process.env.PUSHER_SECRET,
    cluster: process.env.PUSHER_CLUSTER,
    useTLS: true
});

const User = require('./models/User'); // Import the model from models/User.js

// Endpoints
app.get('/api/users/nearby', async (req, res) => {
    const { latitude, longitude, radius = 5000, topics, language, ageRange } = req.query;
    try {
        console.log('Query params:', { latitude, longitude, radius, topics, language, ageRange });
        if (isNaN(parseFloat(latitude)) || isNaN(parseFloat(longitude))) {
            throw new Error('Invalid latitude or longitude');
        }
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
        console.error('Error in /api/users/nearby:', error.stack); // Log full stack trace
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

const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.JWT_SECRET || 'your-secret-key';

app.use((req, res, next) => {
    if (req.path === '/api/users/nearby') return next(); // Allow public access to nearby users
    const token = req.headers['authorization'];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.userId = decoded.userId;
        next();
    });
});

app.post('/api/login', (req, res) => {
    const { username } = req.body;
    const token = jwt.sign({ userId: username }, SECRET_KEY, { expiresIn: '1h' });
    res.json({ token });
});

app.post('/message', (req, res) => {
    pusher.trigger('chat-channel', 'message', { text: req.body.text });
    res.sendStatus(200);
});

app.post('/message', (req, res) => {
    const { text, from, to } = req.body;
    pusher.trigger('chat-channel', 'message', { text, from, to });
    res.sendStatus(200);
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

app.post('/api/connect/:userId', (req, res) => {
    const { userId } = req.params;
    if (!req.userId) return res.status(403).json({ error: 'Authentication required' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));