const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    location: {
        type: { type: String, default: 'Point' },
        coordinates: [Number]
    },
    online: { type: Boolean, default: true },
    preferences: {
        topics: [String],
        language: String,
        ageRange: { min: Number, max: Number }
    },
    createdAt: { type: Date, default: Date.now, expires: 3600 }
});

module.exports = mongoose.model('User', userSchema);