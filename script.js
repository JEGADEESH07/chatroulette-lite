document.addEventListener('DOMContentLoaded', () => {
    // Pusher setup (replace with your actual credentials)
    const pusher = new Pusher('b14541edb68153cc4354', {
        cluster: 'ap2'
    });
    const channel = pusher.subscribe('chat-channel');

    // DOM elements
    const connectBtn = document.getElementById('connect-btn');
    const status = document.getElementById('status');
    const chatBox = document.getElementById('chat-box');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const topicDiv = document.getElementById('topic');
    const topicText = document.getElementById('topic-text');
    const timerDiv = document.getElementById('timer');
    const peopleList = document.getElementById('people-list');
    const connectPersonBtn = document.getElementById('connect-person-btn');
    const consentModal = document.getElementById('consent-modal');
    const consentYes = document.getElementById('consent-yes');
    const consentNo = document.getElementById('consent-no');

    // State
    let isConnected = false;
    let timeLeft = 300; // 5 minutes in seconds
    let personId = null; // To track the connected user ID
    let lastMessageId = ''; // For deduplication

    // Random topic starters
    const topics = [
        "What's your dream vacation spot?",
        "Talk about your favorite movie",
        "What's the best thing you've eaten recently?",
        "Share a fun fact you know"
    ];

    // Expose showTab to global scope
    window.showTab = function(tabId) {
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
    };

    // Expose connectToPerson to global scope
    window.connectToPerson = function(id) {
        personId = id;
        fetch(`https://chatroulette-lite.onrender.com/api/connect/${personId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        })
            .then(response => {
                console.log('Connect response status:', response.status);
                if (!response.ok) {
                    return response.text().then(text => Promise.reject({ status: response.status, message: text || 'Unknown error' }));
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    isConnected = true;
                    connectBtn.textContent = 'Disconnect';
                    status.textContent = `Connected! Chatting with User ${personId}...`;
                    document.querySelector('.input-container').classList.remove('hidden');
                    topicDiv.classList.remove('hidden');

                    const randomTopic = topics[Math.floor(Math.random() * topics.length)];
                    topicText.textContent = randomTopic;
                    startTimer();

                    fetch('https://chatroulette-lite.onrender.com/message', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: `Connected with User ${personId}`, from: 'you', to: personId })
                    }).catch(err => console.error('Error sending connection message:', err));
                    showTab('chat');
                } else {
                    alert('Connection failed: ' + data.error);
                }
            })
            .catch(err => {
                alert('Connection failed! ' + (err.message || 'Unknown error'));
                console.error('Connection error:', err);
            });
    };

    // Connect button logic (simplified to prompt for nearby users)
    connectBtn.addEventListener('click', () => {
        if (!isConnected) {
            showTab('people');
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
        if (message && isConnected) {
            const now = new Date().toLocaleTimeString();
            const messageId = `${message}-${now}`; // Unique ID for deduplication
            chatBox.innerHTML += `<div class="message sent"><span>${message}</span><span class="time">${now}</span></div>`;
            chatBox.scrollTop = chatBox.scrollHeight;

            fetch('https://chatroulette-lite.onrender.com/message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: message, from: personId || 'you', to: personId === 'you' ? 'stranger' : personId, messageId })
            }).catch(err => console.error('Error sending message:', err));
            messageInput.value = '';
            lastMessageId = messageId;
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
        personId = null;
        connectBtn.textContent = 'Connect';
        status.textContent = 'Click "Connect" to start chatting!';
        topicDiv.classList.add('hidden');
        document.querySelector('.input-container').classList.add('hidden');
        chatBox.innerHTML = '';
        timeLeft = 300;
        lastMessageId = '';
    }

    // Function to show available persons
    function showAvailablePersons(radius = 5000) {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(async position => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                console.log('Geolocation:', { lat, lon });

                try {
                    const response = await fetch(`https://chatroulette-lite.onrender.com/api/users/nearby?latitude=${lat}&longitude=${lon}&radius=${radius}`);
                    console.log('Fetch response status:', response.status);
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
                    peopleList.innerHTML += `<p>${person.name} - ${person.distance} <button class="connect-person-btn-small" onclick="connectToPerson('${person.id}')">Connect</button></p>`;
                });
                connectPersonBtn.classList.remove('hidden');
            });
        } else {
            peopleList.innerHTML = '<p>Geolocation not supported. Showing mock data.</p>';
            const mockPersons = [
                { id: 1, name: 'Alex (Online)', distance: '1.2 km away' },
                { id: 2, name: 'Sam (Online)', distance: '2.5 km away' }
            ];
            mockPersons.forEach(person => {
                peopleList.innerHTML += `<p>${person.name} - ${person.distance} <button class="connect-person-btn-small" onclick="connectToPerson('${person.id}')">Connect</button></p>`;
            });
            connectPersonBtn.classList.remove('hidden');
        }
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
            peopleList.innerHTML += `<p>${person.name} - ${person.distance} <button class="connect-person-btn-small" onclick="connectToPerson('${person.id}')">Connect</button></p>`;
        });
        connectPersonBtn.classList.remove('hidden');
    });

    if (localStorage.getItem('locationConsent') === 'true') {
        consentModal.style.display = 'none';
        showAvailablePersons();
    }

    // Revoke location
    window.revokeLocation = function() {
        localStorage.setItem('locationConsent', 'false');
        fetch('https://chatroulette-lite.onrender.com/api/user/location', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        }).catch(err => console.error('Error revoking location:', err));
        peopleList.innerHTML = '<p>Location sharing stopped. Using mock data.</p>';
        const mockPersons = [
            { id: 1, name: 'Alex (Online)', distance: '1.2 km away' },
            { id: 2, name: 'Sam (Online)', distance: '2.5 km away' }
        ];
        mockPersons.forEach(person => {
            peopleList.innerHTML += `<p>${person.name} - ${person.distance} <button class="connect-person-btn-small" onclick="connectToPerson('${person.id}')">Connect</button></p>`;
        });
        connectPersonBtn.classList.remove('hidden');
    };

    // Dashboard
    function showDashboard(userId) {
        fetch(`https://chatroulette-lite.onrender.com/api/user/dashboard?userId=${userId}`)
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

        document.getElementById('update-preferences-btn').addEventListener('click', () => {
            const topics = document.getElementById('topics').value;
            const language = document.getElementById('language').value;
            const ageRange = document.getElementById('ageRange').value;
            fetch('https://chatroulette-lite.onrender.com/api/user/update-preferences', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, preferences: { topics: topics.split(','), language, ageRange } })
            })
                .then(response => response.json())
                .then(data => alert('Preferences updated'))
                .catch(error => console.error('Error updating preferences:', error));
        });
    }

    // Pusher message handler with deduplication
    channel.bind('message', (data) => {
        console.log('Received message event:', data);
        const messageId = data.messageId || `${data.text}-${data.from}`;
        if (isConnected && data.from !== personId && messageId !== lastMessageId) {
            const now = new Date().toLocaleTimeString();
            chatBox.innerHTML += `<div class="message received"><strong>Stranger (${data.from}):</strong> <span>${data.text}</span><span class="time">${now}</span></div>`;
            chatBox.scrollTop = chatBox.scrollHeight;
            lastMessageId = messageId;
        }
    });

    // Initialize with chat tab active
    showTab('chat');
});