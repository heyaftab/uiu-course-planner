const crypto = require('crypto');

// Use a simple in-memory store as fallback for Vercel
let memoryDb = {};

async function getStudent(id) {
  if (process.env.KV_REST_API_TOKEN) {
    try {
      const response = await fetch(`${process.env.KV_REST_API_URL}/get/${id}`, {
        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
      });
      return await response.json();
    } catch (e) {
      return null;
    }
  }
  return memoryDb[id];
}

async function setStudent(id, data) {
  if (process.env.KV_REST_API_TOKEN) {
    try {
      await fetch(`${process.env.KV_REST_API_URL}/set`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ key: id, value: data })
      });
    } catch (e) {}
  } else {
    memoryDb[id] = data;
  }
}

function sendJson(res, status, payload) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function isValidUIUStudentId(id) { return /^\d{10}$/.test(String(id || '').trim()); }
function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim()); }
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, savedHash) {
  if (!savedHash) return false;
  const [salt, hash] = savedHash.split(':');
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(candidate, 'hex'));
}

module.exports = async (req, res) => {
  // Handle CORS pre-flight
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  try {
    const body = req.body;
    const url = (req.url || '').toLowerCase();

    // Route: /api/info
    if (url.includes('info')) {
      sendJson(res, 200, { name: 'UIU Course Planner API', status: 'running' });
      return;
    }
    // Route: /api/signup
    if (url.includes('signup')) {
      const { name, email, studentId, password } = body || {};
      const id = String(studentId || '').trim();
      if (!name || !isValidEmail(email) || !isValidUIUStudentId(id) || !password || password.length < 6) {
        sendJson(res, 400, { error: 'Invalid input data. Please provide name, email, 10-digit ID, and password (min 6 chars).' });
        return;
      }
      if (await getStudent(id)) {
        sendJson(res, 409, { error: 'Student ID already exists.' });
        return;
      }
      await setStudent(id, { id, name, email, passwordHash: hashPassword(password) });
      sendJson(res, 201, { student: { id, name } });
      return;
    }
    // Route: /api/login
    if (url.includes('login')) {
      const { studentId, password } = body || {};
      const id = String(studentId || '').trim();
      const student = await getStudent(id);
      if (!student || !verifyPassword(password || '', student.passwordHash)) {
        sendJson(res, 401, { error: 'Invalid credentials.' });
        return;
      }
      sendJson(res, 200, { student: { id: student.id, name: student.name } });
      return;
    }
    // Route: /api/profile
    if (url.includes('profile')) {
      const { studentId, name, phone, password, profilePhoto } = body || {};
      const id = String(studentId || '').replace(/\D/g, '');
      const student = await getStudent(id);
      if (!student) {
        sendJson(res, 404, { error: 'Student account not found.' });
        return;
      }
      if (name) student.name = name;
      if (phone) student.phone = phone;
      if (profilePhoto) student.profilePhoto = profilePhoto;
      if (password) student.passwordHash = hashPassword(password);
      await setStudent(id, student);
      sendJson(res, 200, { student });
      return;
    }
    sendJson(res, 404, { error: 'Route not found' });
  } catch (e) {
    sendJson(res, 500, { error: 'Internal Server Error: ' + e.message });
  }
};
