const mongoose = require('mongoose');
const User = require('./models/User'); // Correct path to the new User.js

async function addTestUsers() {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb+srv://chatuser:securepassword123@chatroulette-lite-clust.amhu0.mongodb.net/?retryWrites=true&w=majority&appName=chatroulette-lite-cluster");
    const users = [
        {
            location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
            preferences: { topics: ['movies'], language: 'en', ageRange: { min: 18, max: 30 } }
        },
        {
            location: { type: 'Point', coordinates: [-122.4094, 37.7849] },
            preferences: { topics: ['gaming'], language: 'en', ageRange: { min: 20, max: 35 } }
        },
        {
        location: { type: 'Point', coordinates: [80.019342, 13.029616] }, // Your current location (longitude, latitude)
            preferences: { topics: ['chat'], language: 'en', ageRange: { min: 18, max: 30 } }
        },
    ];
    await User.insertMany(users);
    console.log('Test users added');
    mongoose.connection.close();
}

addTestUsers().catch(console.error);