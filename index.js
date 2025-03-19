const express = require('express');
const socketIo = require('socket.io');
const http = require('http');
const axios = require('axios');
const dotenv = require('dotenv');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json());
app.use(cors());

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

console.log('SUPABASE_URL:', supabaseUrl);

// Test Supabase connection
async function testConnection() {
  const { data, error } = await supabase.from('vehicles').select('id').limit(1);
  if (error) {
    console.error('Supabase Connection Error:', error);
  } else {
    console.log('Supabase Connected Successfully');
  }
}
testConnection();

const uploadPhoto = async (photoBase64, licensePlate) => {
  const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, '');
  const params = new URLSearchParams();
  params.append('key', process.env.IMGBB_API_KEY);
  params.append('image', base64Data);
  params.append('name', `${licensePlate}-${Date.now()}`);
  params.append('expiration', '600');

  const response = await axios.post('https://api.imgbb.com/1/upload', params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return response.data.data.url;
};

app.post('/api/vehicle/entry', async (req, res) => {
  console.log('Request Body:', req.body);
  const { license_plate, parking_location, photo_base64 } = req.body;
  const entry_time = new Date();

  if (!photo_base64) {
    return res.status(400).json({ error: 'photo_base64 is required' });
  }

  try {
    const photo_url = await uploadPhoto(photo_base64, license_plate);
    console.log('Photo URL:', photo_url);
    const { data, error } = await supabase
      .from('vehicles')
      .insert([
        {
          license_plate,
          entry_time,
          parking_location,
          photo_url,
        },
      ])
      .select(); // Returns the inserted row
    if (error) throw error;
    console.log('Insert Result:', data[0]);
    res.json(data[0]);
  } catch (err) {
    console.error('Detailed Error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// Optional: Retrieve all vehicles
app.get('/api/vehicles', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vehicles').select('*');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Retrieve Error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server on port ${PORT}`));