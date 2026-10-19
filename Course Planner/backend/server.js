const crypto = require('crypto');

let memoryDb = {};

async function getStudent(id) {
  if (process.env.KV_REST_API_TOKEN) {
    try {
      const response = await fetch(`${process.env.KV_REST_API_URL}/get/${id}`, {
        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
      });
      return await response.json();
    } catch (e) {
      console.error('KV Get Error:', e);
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
    } catch (e) {
      console.error('KV Set Error:', e);
    }
  } else {
    memoryDb[id] = data;
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(payload));
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(html);
}

function isValidUIUStudentId(id) {
  return /^\d{10}$/.test(String(id || '').trim());
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

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

function publicStudent(student) {
  return {
    id: student.id,
    name: student.name,
    phone: student.phone || '',
    profilePhoto: student.profilePhoto || ''
  };
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  try {
    const { body } = req;
    const url = (req.url || '').toLowerCase();

    // Flexible Route Matching
    const isRoot = url === '/' || url === '/api';
    const isInfo = url.endsWith('/info');
    const isSignup = url.endsWith('/signup');
    const isLogin = url.endsWith('/login');
    const isProfile = url.endsWith('/profile');

    if (req.method === 'GET' && isRoot) {
       sendHtml(res, 200, '<h1 style="font-family:sans-serif">Backend is running</h1><p>Database: ' + (process.env.KV_REST_API_TOKEN ? 'Vercel KV' : 'In-Memory (Temporary)') + '</p>');
       return;
    }
    if (req.method === 'GET' && isInfo) {
      sendJson(res, 200, { name: 'UIU Course Planner API', status: 'running', db: process.env.KV_REST_API_TOKEN ? 'KV' : 'Memory' });
      return;
    }

    if (req.method === 'POST' && isSignup) {
      const { name, email, studentId, password } = body || {};
      const id = String(studentId || '').trim();
      if (!name || !isValidEmail(email) || !isValidUIUStudentId(id) || !password || password.length < 6) {
        sendJson(res, 400, { error: 'Valid data required (Name, Email, 10-digit ID, Password min 6 chars).' });
        return;
      }
      const existing = await getStudent(id);
      if (existing) {
        sendJson(res, 409, { error: 'Student ID already exists.' });
        return;
      }
      const studentData = { id, name: String(name).trim(), email: String(email).trim(), passwordHash: hashPassword(password) };
      await setStudent(id, studentData);
      sendJson(res, 201, { student: { id, name: studentData.name } });
      return;
    }

    if (req.method === 'POST' && isLogin) {
      const { studentId, password } = body || {};
      const id = String(studentId || '').trim();
      const student = await getStudent(id);
      if (!student || !verifyPassword(password || '', student.passwordHash)) {
        sendJson(res, 401, { error: 'Invalid Student ID or password.' });
        return;
      }
      sendJson(res, 200, { student: publicStudent(student) });
      return;
    }

    if (req.method === 'POST' && isProfile) {
      const { studentId, name, phone = '', password = '', profilePhoto = '' } = body || {};
      const id = String(studentId || '').replace(/\D/g, '');
      const student = await getStudent(id);
      if (!student) {
        sendJson(res, 404, { error: 'Student account not found.' });
        return;
      }
      student.name = String(name).trim();
      student.phone = String(phone).trim();
      student.profilePhoto = String(profilePhoto);
      if (password) student.passwordHash = hashPassword(String(password));
      await setStudent(id, student);
      sendJson(res, 200, { student: publicStudent(student) });
      return;
    }

    sendJson(res, 404, { error: `Route not found: ${url}` });
  } catch (error) {
    sendJson(res, 500, { error: 'Internal Server Error: ' + error.message });
  }
};
