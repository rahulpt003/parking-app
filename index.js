const express = require('express');
const { Pool } = require('pg');
const socketIo = require('socket.io');
const http = require('http');
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json());

// Database connection (Supabase)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Upload photo to ImgBB
const uploadPhoto = async (photoBase64, licensePlate) => {
  const response = await axios.post('https://api.imgbb.com/1/upload', {
    key: process.env.IMGBB_API_KEY,
    image: photoBase64,
    name: `${licensePlate}-${Date.now()}`,
  }, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  return response.data.data.url;
};

// Vehicle entry
app.post('/api/vehicle/entry', async (req, res) => {
  const { license_plate, parking_location, photo_base64 } = req.body;
  const entry_time = new Date();
  try {
    const photo_url = await uploadPhoto(photo_base64, license_plate);
    const result = await pool.query(
      'INSERT INTO vehicles (license_plate, entry_time, parking_location, photo_url) VALUES ($1, $2, $3, $4) RETURNING *',
      [license_plate, entry_time, JSON.stringify(parking_location), photo_url] // Store as JSON
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error' });
  }
});

// Vehicle exit
app.post('/api/vehicle/exit', async (req, res) => {
  const { license_plate } = req.body;
  const exit_time = new Date();
  try {
    const vehicle = await pool.query(
      'UPDATE vehicles SET exit_time = $1 WHERE license_plate = $2 AND exit_time IS NULL RETURNING *',
      [exit_time, license_plate]
    );
    if (vehicle.rows.length === 0) return res.status(404).json({ error: 'Vehicle not found' });

    const entry_time = vehicle.rows[0].entry_time;
    const diffMs = exit_time - entry_time;
    const hours = diffMs / (1000 * 60 * 60);
    const total_amount = hours <= 3.5 ? 10 : 10 + Math.ceil(hours - 3.5) * 10;

    const result = await pool.query(
      'UPDATE vehicles SET total_amount = $1 WHERE license_plate = $2 RETURNING *',
      [total_amount, license_plate]
    );

    io.emit('vehicle_exit', result.rows[0]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error' });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server on port ${PORT}`));