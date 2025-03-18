const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    _id: String,
    preferredName: String,
    location: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: [Number]
    },
    preferences: {
        topics: [String],
        language: String,
        ageRange: String
    },
    online: Boolean
});
userSchema.index({ location: '2dsphere' });
const User = mongoose.model('User', userSchema);

module.exports = mongoose.model('User', userSchema);