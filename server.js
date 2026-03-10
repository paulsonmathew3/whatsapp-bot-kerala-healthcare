// WhatsApp Hospital Booking Bot - Real Implementation
// Install dependencies: npm install express twilio body-parser dotenv

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const twilio = require('twilio');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// In-memory session storage (use Redis/DB in production)
const sessions = new Map();

// Get or create session
function getSession(phoneNumber) {
    if (!sessions.has(phoneNumber)) {
        sessions.set(phoneNumber, {
            step: 'initial',
            data: {},
            lastActivity: Date.now()
        });
    }
    return sessions.get(phoneNumber);
}

// Clean up old sessions (15 min timeout)
setInterval(() => {
    const timeout = 15 * 60 * 1000;
    const now = Date.now();
    for (const [phone, session] of sessions.entries()) {
        if (now - session.lastActivity > timeout) {
            sessions.delete(phone);
        }
    }
}, 60000);

// Message templates in Malayalam and English
const messages = {
    ml: {
        welcome: "നമസ്കാരം! കേരള സർക്കാർ ആശുപത്രി അപ്പോയിന്റ്മെന്റ് ബുക്കിംഗിലേക്ക് സ്വാഗതം! 🏥\n\nആരംഭിക്കാൻ 'Hi' അയയ്ക്കുക.",
        chooseLanguage: "ഭാഷ തിരഞ്ഞെടുക്കുക:\n1️⃣ മലയാളം\n2️⃣ English\n3️⃣ हिन्दी\n4️⃣ தமிழ்",
        askName: "നിങ്ങളുടെ പേര് എന്താണ്? 📝\n\nഉദാഹരണം: രാജേഷ് കുമാർ",
        confirmPhone: (name, phone) => `നന്ദി ${name}! 🙏\n\nനിങ്ങളുടെ മൊബൈൽ നമ്പർ: ${phone}\n\nശരിയാണോ?\n1️⃣ ശരിയാണ്\n2️⃣ മാറ്റുക`,
        selectDistrict: "ഏത് ജില്ലയിൽ? 📍\n\n1️⃣ തിരുവനന്തപുരം\n2️⃣ കൊല്ലം\n3️⃣ ആലപ്പുഴ\n4️⃣ കോട്ടയം\n5️⃣ എറണാകുളം\n6️⃣ തൃശൂർ",
        selectHospital: "ആശുപത്രി തിരഞ്ഞെടുക്കുക 🏥\n\n1️⃣ ജനറൽ ആശുപത്രി\n2️⃣ ജില്ലാ ആശുപത്രി\n3️⃣ താലൂക്ക് ആശുപത്രി",
        selectDepartment: "ഏത് ഡിപ്പാർട്ട്‌മെന്റ്? 👨‍⚕️\n\n1️⃣ ജനറൽ മെഡിസിൻ\n2️⃣ ഓർത്തോപീഡിക്സ്\n3️⃣ കാർഡിയോളജി\n4️⃣ ന്യൂറോളജി",
        selectDoctor: "ഡോക്ടർ തിരഞ്ഞെടുക്കുക\n\n1️⃣ Dr. Priya Kumar ⭐ 4.6/5\n2️⃣ Dr. Ajay Menon ⭐ 4.8/5",
        selectDate: "തീയതി തിരഞ്ഞെടുക്കുക 📅\n\n1️⃣ Dec 10, 2025 (Wed) 🟢\n2️⃣ Dec 12, 2025 (Fri) 🟡\n3️⃣ Dec 15, 2025 (Mon) 🟢\n4️⃣ Dec 17, 2025 (Wed) 🟢",
        selectTime: "സമയം തിരഞ്ഞെടുക്കുക ⏰\n\n1️⃣ 09:00 AM [5 slots]\n2️⃣ 10:00 AM [2 slots]\n3️⃣ 11:00 AM [4 slots]\n4️⃣ 02:00 PM [Full]",
        summary: (data) => `📋 നിങ്ങളുടെ അപ്പോയിന്റ്മെന്റ്\n\n👤 ${data.name}\n📱 ${data.phone}\n🏥 ${data.hospital}\n👨‍⚕️ ${data.doctor}\n📅 ${data.date}\n⏰ ${data.time}\n💰 ഫീസ്: ₹30\n\nശരിയാണോ?\n1️⃣ സ്ഥിരീകരിക്കുക\n2️⃣ മാറ്റുക`,
        payment: "പേയ്മെന്റ് രീതി 💳\n\n1️⃣ UPI\n2️⃣ കാർഡ്\n3️⃣ ആശുപത്രിയിൽ അടയ്ക്കുക",
        success: (token) => `✅ ബുക്ക് ചെയ്തു!\n\n🔢 ടോക്കൺ: ${token}\n\nആശുപത്രിയിൽ ഈ മെസേജ് കാണിക്കുക.\n\n⏰ റിമൈൻഡർ 23 മണിക്കൂർ മുമ്പ് അയയ്ക്കും.\n\nഅധിക സഹായത്തിന്: Help`
    },
    en: {
        welcome: "Welcome to Kerala Government Hospital Appointments! 🏥\n\nSend 'Hi' to start booking.",
        chooseLanguage: "Choose your language:\n1️⃣ മലയാളം\n2️⃣ English\n3️⃣ हिन्दी\n4️⃣ தமிழ்",
        askName: "What's your name? 📝\n\nExample: Rajesh Kumar",
        confirmPhone: (name, phone) => `Thank you ${name}! 🙏\n\nYour mobile: ${phone}\n\nIs this correct?\n1️⃣ Yes\n2️⃣ Change`,
        selectDistrict: "Which district? 📍\n\n1️⃣ Thiruvananthapuram\n2️⃣ Kollam\n3️⃣ Alappuzha\n4️⃣ Kottayam\n5️⃣ Ernakulam\n6️⃣ Thrissur",
        selectHospital: "Select Hospital 🏥\n\n1️⃣ General Hospital\n2️⃣ District Hospital\n3️⃣ Taluk Hospital",
        selectDepartment: "Which department? 👨‍⚕️\n\n1️⃣ General Medicine\n2️⃣ Orthopedics\n3️⃣ Cardiology\n4️⃣ Neurology",
        selectDoctor: "Select Doctor\n\n1️⃣ Dr. Priya Kumar ⭐ 4.6/5\n2️⃣ Dr. Ajay Menon ⭐ 4.8/5",
        selectDate: "Select Date 📅\n\n1️⃣ Dec 10, 2025 (Wed) 🟢\n2️⃣ Dec 12, 2025 (Fri) 🟡\n3️⃣ Dec 15, 2025 (Mon) 🟢\n4️⃣ Dec 17, 2025 (Wed) 🟢",
        selectTime: "Select Time ⏰\n\n1️⃣ 09:00 AM [5 slots]\n2️⃣ 10:00 AM [2 slots]\n3️⃣ 11:00 AM [4 slots]\n4️⃣ 02:00 PM [Full]",
        summary: (data) => `📋 Your Appointment\n\n👤 ${data.name}\n📱 ${data.phone}\n🏥 ${data.hospital}\n👨‍⚕️ ${data.doctor}\n📅 ${data.date}\n⏰ ${data.time}\n💰 Fee: ₹30\n\nCorrect?\n1️⃣ Confirm\n2️⃣ Edit`,
        payment: "Payment Method 💳\n\n1️⃣ UPI\n2️⃣ Card\n3️⃣ Pay at Hospital",
        success: (token) => `✅ Booking Confirmed!\n\n🔢 Token: ${token}\n\nShow this at hospital.\n\n⏰ Reminder will be sent 23hrs before.\n\nFor help: Type Help`
    }
};

// Data mappings
const districts = {
    ml: ['തിരുവനന്തപുരം', 'കൊല്ലം', 'ആലപ്പുഴ', 'കോട്ടയം', 'എറണാകുളം', 'തൃശൂർ'],
    en: ['Thiruvananthapuram', 'Kollam', 'Alappuzha', 'Kottayam', 'Ernakulam', 'Thrissur']
};

const hospitals = {
    ml: ['ജനറൽ ആശുപത്രി', 'ജില്ലാ ആശുപത്രി', 'താലൂക്ക് ആശുപത്രി'],
    en: ['General Hospital', 'District Hospital', 'Taluk Hospital']
};

const departments = {
    ml: ['ജനറൽ മെഡിസിൻ', 'ഓർത്തോപീഡിക്സ്', 'കാർഡിയോളജി', 'ന്യൂറോളജി'],
    en: ['General Medicine', 'Orthopedics', 'Cardiology', 'Neurology']
};

const doctors = ['Dr. Priya Kumar', 'Dr. Ajay Menon'];
const dates = ['Dec 10, 2025 (Wed)', 'Dec 12, 2025 (Fri)', 'Dec 15, 2025 (Mon)', 'Dec 17, 2025 (Wed)'];
const times = ['09:00 AM', '10:00 AM', '11:00 AM', '02:00 PM'];

// Generate token
function generateToken() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const letter = letters[Math.floor(Math.random() * letters.length)];
    const number = Math.floor(Math.random() * 100).toString().padStart(3, '0');
    return `${letter}-${number}`;
}

// Process incoming messages
function processMessage(from, body) {
    const session = getSession(from);
    session.lastActivity = Date.now();
    
    const lang = session.data.language || 'en';
    const msg = messages[lang];
    const bodyLower = body.toLowerCase().trim();
    
    let response = '';

    switch (session.step) {
        case 'initial':
            if (bodyLower.includes('hi') || bodyLower.includes('hello') || bodyLower.includes('start')) {
                session.step = 'language';
                response = messages.en.chooseLanguage;
            } else {
                response = messages.en.welcome;
            }
            break;

        case 'language':
            const langMap = { '1': 'ml', '2': 'en', '3': 'hi', '4': 'ta' };
            session.data.language = langMap[body] || 'en';
            session.step = 'name';
            response = messages[session.data.language].askName;
            break;

        case 'name':
            session.data.name = body;
            session.step = 'phone';
            response = msg.confirmPhone(body, from);
            break;

        case 'phone':
            if (body === '1') {
                session.data.phone = from;
                session.step = 'district';
                response = msg.selectDistrict;
            } else {
                response = "Please enter your phone number:";
            }
            break;

        case 'district':
            const districtIndex = parseInt(body) - 1;
            if (districtIndex >= 0 && districtIndex < districts[lang].length) {
                session.data.district = districts[lang][districtIndex];
                session.step = 'hospital';
                response = msg.selectHospital;
            } else {
                response = msg.selectDistrict;
            }
            break;

        case 'hospital':
            const hospitalIndex = parseInt(body) - 1;
            if (hospitalIndex >= 0 && hospitalIndex < hospitals[lang].length) {
                session.data.hospital = hospitals[lang][hospitalIndex];
                session.step = 'department';
                response = msg.selectDepartment;
            } else {
                response = msg.selectHospital;
            }
            break;

        case 'department':
            const deptIndex = parseInt(body) - 1;
            if (deptIndex >= 0 && deptIndex < departments[lang].length) {
                session.data.department = departments[lang][deptIndex];
                session.step = 'doctor';
                response = msg.selectDoctor;
            } else {
                response = msg.selectDepartment;
            }
            break;

        case 'doctor':
            const doctorIndex = parseInt(body) - 1;
            if (doctorIndex >= 0 && doctorIndex < doctors.length) {
                session.data.doctor = doctors[doctorIndex];
                session.step = 'date';
                response = msg.selectDate;
            } else {
                response = msg.selectDoctor;
            }
            break;

        case 'date':
            const dateIndex = parseInt(body) - 1;
            if (dateIndex >= 0 && dateIndex < dates.length) {
                session.data.date = dates[dateIndex];
                session.step = 'time';
                response = msg.selectTime;
            } else {
                response = msg.selectDate;
            }
            break;

        case 'time':
            const timeIndex = parseInt(body) - 1;
            if (body === '4') {
                response = lang === 'ml' ? 
                'ക്ഷമിക്കണം, ഈ സ്ലോട്ട് നിറഞ്ഞു. മറ്റൊന്ന് തിരഞ്ഞെടുക്കുക.' :
                'Sorry, this slot is full. Please select another.';
            } else if (timeIndex >= 0 && timeIndex < 3) {
                session.data.time = times[timeIndex];
                session.step = 'confirm';
                response = msg.summary(session.data);
            } else {
                response = msg.selectTime;
            }
            break;

        case 'confirm':
            if (body === '1') {
                session.step = 'payment';
                response = msg.payment;
            } else if (body === '2') {
                session.step = 'initial';
                response = lang === 'ml' ? 
                'ശരി! വീണ്ടും ആരംഭിക്കാൻ "Hi" അയയ്ക്കുക.' :
                'Okay! Send "Hi" to start again.';
            }
            break;

        case 'payment':
            if (['1', '2', '3'].includes(body)) {
                const token = generateToken();
                session.data.token = token;
                session.step = 'complete';
                response = msg.success(token);
                
                // Reset session after success
                setTimeout(() => sessions.delete(from), 60000);
            } else {
                response = msg.payment;
            }
            break;

        default:
            session.step = 'initial';
            response = msg.welcome;
    }

  return response;
}

// Webhook endpoint for incoming messages
app.post('/webhook', (req, res) => {
    const from = req.body.From;
    const body = req.body.Body;
    
    console.log(`Message from ${from}: ${body}`);
    
    const response = processMessage(from, body);
    
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(response);
    
    res.type('text/xml');
    res.send(twiml.toString());
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        activeSessions: sessions.size,
        uptime: process.uptime()
    });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 WhatsApp Bot Server running on port ${PORT}`);
    console.log(`📱 Webhook URL: http://localhost:${PORT}/webhook`);
    console.log(`💚 Ready to receive WhatsApp messages!`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    process.exit(0);
});