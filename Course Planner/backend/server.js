const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// IMPORTANT: Railway provides the PORT environment variable.
// We MUST use process.env.PORT for Railway to route traffic to us.
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const STUDENTS_FILE = path.join(DATA_DIR, 'students.json');
const FRONTEND_DIR = path.join(__dirname, '../frontend');

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STUDENTS_FILE)) fs.writeFileSync(STUDENTS_FILE, '{}');
}

function readStudents() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(STUDENTS_FILE, 'utf8'));
}

function writeStudents(students) {
  ensureDataFile();
  fs.writeFileSync(STUDENTS_FILE, JSON.stringify(students, null, 2));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } 
      catch (e) { reject(e); }
    });
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
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

function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('File Not Found: ' + filePath);
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  const url = req.url || '';

  // 1. API Routes
  if (url.startsWith('/api')) {
    try {
      if (req.method === 'GET' && (url === '/api' || url === '/api/info')) {
        sendJson(res, 200, { name: 'UIU Course Planner API', status: 'running', port: PORT });
        return;
      }
      if (req.method === 'POST' && url === '/api/signup') {
        const { name, email, studentId, password } = await readBody(req);
        const id = String(studentId || '').trim();
        if (!name || !isValidEmail(email) || !isValidUIUStudentId(id) || !password || password.length < 6) {
          sendJson(res, 400, { error: 'Invalid input data.' });
          return;
        }
        const students = readStudents();
        if (students[id]) {
          sendJson(res, 409, { error: 'Student ID exists.' });
          return;
        }
        students[id] = { id, name, email, passwordHash: hashPassword(password) };
        writeStudents(students);
        sendJson(res, 201, { student: { id, name } });
        return;
      }
      if (req.method === 'POST' && url === '/api/login') {
        const { studentId, password } = await readBody(req);
        const id = String(studentId || '').trim();
        const students = readStudents();
        const student = students[id];
        if (!student || !verifyPassword(password || '', student.passwordHash)) {
          sendJson(res, 401, { error: 'Invalid credentials.' });
          return;
        }
        sendJson(res, 200, { student: { id: student.id, name: student.name } });
        return;
      }
      if (req.method === 'POST' && url === '/api/profile') {
        const { studentId, name, phone, password, profilePhoto } = await readBody(req);
        const id = String(studentId || '').replace(/\D/g, '');
        const students = readStudents();
        const student = students[id];
        if (!student) {
          sendJson(res, 404, { error: 'Not found.' });
          return;
        }
        if (name) student.name = name;
        if (phone) student.phone = phone;
        if (profilePhoto) student.profilePhoto = profilePhoto;
        if (password) student.passwordHash = hashPassword(password);
        students[id] = student;
        writeStudents(students);
        sendJson(res, 200, { student });
        return;
      }
      sendJson(res, 404, { error: 'API Route not found' });
    } catch (e) {
      sendJson(res, 500, { error: e.message });
    }
    return;
  }

  // 2. Static Frontend Files
  let relativePath = url === '/' ? 'index.html' : url;
  let filePath = path.join(FRONTEND_DIR, relativePath);
  
  let contentType = 'text/html';
  if (filePath.endsWith('.js')) contentType = 'application/javascript';
  else if (filePath.endsWith('.css')) contentType = 'text/css';
  else if (filePath.endsWith('.png')) contentType = 'image/png';
  else if (filePath.endsWith('.jpg')) contentType = 'image/jpeg';
  else if (filePath.endsWith('.svg')) contentType = 'image/svg+xml';

  serveFile(res, filePath, contentType);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is listening on port ${PORT}`);
});
