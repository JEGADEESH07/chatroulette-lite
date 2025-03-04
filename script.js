// Pusher setup (replace with your credentials from .env or Heroku config)
const pusher = new Pusher('YOUR_PUSHER_KEY', {
    cluster: 'YOUR_PUSHER_CLUSTER'
});
const channel = pusher.subscribe('chat-channel');

// DOM elements
const connectBtn = document.getElementById('connect-btn');
const status = document.getElementById('status');
const chatBox = document.getElementById('chat-box');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const topicDiv = document.getElementById('topic');
const timerDiv = document.getElementById('timer');
const peopleList = document.getElementById('people-list');
const connectPersonBtn = document.getElementById('connect-person-btn');
const consentModal = document.getElementById('consent-modal');
const consentYes = document.getElementById('consent-yes');
const consentNo = document.getElementById('consent-no');

// State
let isConnected = false;
let timeLeft = 300; // 5 minutes in seconds

// Random topic starters
const topics = [
    'What’s your dream vacation spot?',
    'Talk about your favorite movie',
    'What’s the best thing you’ve eaten recently?',
    'Share a fun fact you know'
];

// Tab functionality
function showTab(tabId) {
    const tabs = document.querySelectorAll('.tab-content');
    const buttons = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => tab.classList.remove('active'));
    buttons.forEach(btn => btn.classList.remove('active'));
    document.getElementById(tabId + '-tab').classList.add('active');
    document.querySelector(`.tab-btn[onclick="showTab('${tabId}')"]`).classList.add('active');

    if (tabId === 'dashboard') {
        showDashboard('mockUserId123');
    } else if (tabId === 'people') {
        showAvailablePersons();
    }
}

// Connect button logic
connectBtn.addEventListener('click', () => {
    if (!isConnected) {
        isConnected = true;
        connectBtn.textContent = 'Disconnect';
        status.textContent = 'Connected! Chatting with a stranger...';
        chatBox.classList.remove('hidden');
        document.querySelector('.input-container').classList.remove('hidden');
        topicDiv.classList.remove('hidden');
        timerDiv.classList.remove('hidden');

        // Show random topic
        const randomTopic = topics[Math.floor(Math.random() * topics.length)];
        topicDiv.textContent = `Topic Starter: ${randomTopic}`;

        // Start timer
        startTimer();

        // Listen for incoming messages
        channel.bind('message', (data) => {
            chatBox.innerHTML += `<p><strong>Stranger:</strong> ${data.text}</p>`;
            chatBox.scrollTop = chatBox.scrollHeight;
        });
    } else {
        resetChat();
    }
});

// Send message logic
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && messageInput.value.trim() !== '') {
        sendMessage();
    }
});

function sendMessage() {
    const message = messageInput.value.trim();
    if (message) {
        const now = new Date().toLocaleTimeString();
        chatBox.innerHTML += `<p class="user1"><strong>You:</strong> ${message} <span class="time">${now}</span></p>`;
        chatBox.scrollTop = chatBox.scrollHeight;

        fetch('http://localhost:5000/message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: message, from: 'you', to: personId }) // personId from connectToPerson
        }).catch(err => console.error('Error sending message:', err));
        messageInput.value = '';
    }
}

// Timer logic
function startTimer() {
    const timer = setInterval(() => {
        timeLeft--;
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        timerDiv.textContent = `${minutes}:${seconds < 10 ? '0' + seconds : seconds}`;
        if (timeLeft <= 0) {
            clearInterval(timer);
            resetChat();
        }
    }, 1000);
}

// Reset chat
function resetChat() {
    isConnected = false;
    connectBtn.textContent = 'Connect';
    status.textContent = 'Disconnected. Click "Connect" to start again!';
    chatBox.classList.add('hidden');
    document.querySelector('.input-container').classList.add('hidden');
    topicDiv.classList.add('hidden');
    timerDiv.classList.add('hidden');
    chatBox.innerHTML = '';
    timeLeft = 300;
}

// Function to show available persons
function showAvailablePersons(radius = 5000) {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async position => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;

            try {
                const response = await fetch(`http://localhost:5000/api/users/nearby?latitude=${lat}&longitude=${lon}&radius=${radius}`);
                if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
                const nearbyUsers = await response.json();
                console.log('Fetched users:', nearbyUsers);
                peopleList.innerHTML = '<h3>Available Persons Nearby</h3>';
                if (nearbyUsers.length === 0) {
                    peopleList.innerHTML += '<p>No nearby users found. Try adjusting the radius.</p>';
                } else {
                    nearbyUsers.forEach(user => {
                        const prefs = user.preferences || {};
                        peopleList.innerHTML += `<p>User ${user._id} - ${Math.round(user.dist.calculated / 1000)} km away (Topics: ${prefs.topics || 'None'}) <button class="connect-person-btn-small" onclick="connectToPerson('${user._id}')">Connect</button></p>`;
                    });
                }
                connectPersonBtn.classList.remove('hidden');
            } catch (error) {
                peopleList.innerHTML = '<p>Error fetching nearby users. Details: ' + error.message + '</p>';
                console.error('Fetch error:', error);
            }
        }, error => {
            peopleList.innerHTML = '<p>Location access denied or error. Showing mock data.</p>';
            const mockPersons = [
                { id: 1, name: 'Alex (Online)', distance: '1.2 km away' },
                { id: 2, name: 'Sam (Online)', distance: '2.5 km away' }
            ];
            mockPersons.forEach(person => {
                peopleList.innerHTML += `<p>${person.name} - ${person.distance} <button class="connect-person-btn-small" onclick="connectToPerson(${person.id})">Connect</button></p>`;
            });
            connectPersonBtn.classList.remove('hidden');
        });
    } else {
        // ... (rest of the code)
    }
}

// Connect to a nearby person
function connectToPerson(personId) {
    alert(`Connecting to person ID ${personId}...`); // Temporary feedback
    // Simulate pairing (in a real app, this would involve Pusher or backend logic)
    isConnected = true;
    connectBtn.textContent = 'Disconnect';
    status.textContent = `Connected! Chatting with User ${personId}...`;
    chatBox.classList.remove('hidden');
    document.querySelector('.input-container').classList.remove('hidden');
    topicDiv.classList.remove('hidden');
    timerDiv.classList.remove('hidden');

    const randomTopic = topics[Math.floor(Math.random() * topics.length)];
    topicDiv.textContent = `Topic Starter: ${randomTopic}`;
    startTimer();

    // Bind to receive messages from the paired user
    channel.bind('message', (data) => {
        if (data.from !== personId) { // Avoid echoing your own messages
            chatBox.innerHTML += `<p><strong>Stranger (${data.from}):</strong> ${data.text}</p>`;
            chatBox.scrollTop = chatBox.scrollHeight;
        }
    });

    // Send initial connection message to the paired user (via Pusher)
    fetch(`http://localhost:5000/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `Connected with User ${personId}`, from: 'you', to: personId })
    }).catch(err => console.error('Error sending connection message:', err));

    showTab('chat'); // Switch to chat tab
}

// Consent modal
consentModal.style.display = 'block';

consentYes.addEventListener('click', () => {
    consentModal.style.display = 'none';
    localStorage.setItem('locationConsent', 'true');
    showAvailablePersons();
});

consentNo.addEventListener('click', () => {
    consentModal.style.display = 'none';
    localStorage.setItem('locationConsent', 'false');
    peopleList.innerHTML = '<p>Location sharing declined. Using mock data.</p>';
    const mockPersons = [
        { id: 1, name: 'Alex (Online)', distance: '1.2 km away' },
        { id: 2, name: 'Sam (Online)', distance: '2.5 km away' }
    ];
    mockPersons.forEach(person => {
        peopleList.innerHTML += `<p>${person.name} - ${person.distance} <button class="connect-person-btn-small" onclick="connectToPerson(${person.id})">Connect</button></p>`;
    });
    connectPersonBtn.classList.remove('hidden');
});

if (localStorage.getItem('locationConsent') === 'true') {
    consentModal.style.display = 'none';
    showAvailablePersons();
}

function revokeLocation() {
    localStorage.setItem('locationConsent', 'false');
    fetch('/api/user/location', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
    }).catch(err => console.error('Error revoking location:', err));
    peopleList.innerHTML = '<p>Location sharing stopped. Using mock data.</p>';
    const mockPersons = [
        { id: 1, name: 'Alex (Online)', distance: '1.2 km away' },
        { id: 2, name: 'Sam (Online)', distance: '2.5 km away' }
    ];
    mockPersons.forEach(person => {
        peopleList.innerHTML += `<p>${person.name} - ${person.distance} <button class="connect-person-btn-small" onclick="connectToPerson(${person.id})">Connect</button></p>`;
    });
    connectPersonBtn.classList.remove('hidden');
}

function showDashboard(userId) {
    fetch(`/api/user/dashboard?userId=${userId}`)
        .then(response => response.json())
        .then(data => {
            document.getElementById('dashboard-content').innerHTML = `
                <p>Location: ${data.location ? JSON.stringify(data.location) : 'Not shared'}</p>
                <p>Online Status: ${data.online ? 'Online' : 'Offline'}</p>
                <p>Preferences: ${JSON.stringify(data.preferences)}</p>
                <p>Shared At: ${new Date(data.sharedAt).toLocaleString()}</p>
            `;
        })
        .catch(error => console.error('Error loading dashboard:', error));

    document.getElementById('toggle-location-btn').addEventListener('click', () => {
        fetch('/api/user/toggle-location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, shareLocation: false })
        })
            .then(response => response.json())
            .then(data => alert('Location sharing updated'))
            .catch(error => console.error('Error toggling location:', error));
    });

    document.getElementById('update-preferences-btn').addEventListener('click', () => {
        const topics = document.getElementById('topics').value;
        const language = document.getElementById('language').value;
        const ageRange = document.getElementById('ageRange').value;
        fetch('/api/user/update-preferences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, preferences: { topics: topics.split(','), language, ageRange } })
        })
            .then(response => response.json())
            .then(data => alert('Preferences updated'))
            .catch(error => console.error('Error updating preferences:', error));
    });
}

// Initialize with chat tab active
showTab('chat');