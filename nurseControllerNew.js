const pool = require('../db.js');
const axios = require('axios');

async function search_nurses(nurse_type, shift, location) {
    try {
      // Construct the search query
      let query = `
        SELECT * FROM nurses
        WHERE 1=1
      `;
  
      const queryParams = [];
  
      // Conditionally add filters based on the provided values
      if (nurse_type) {
        query += ` AND nurse_type = $${queryParams.length + 1}`;
        queryParams.push(nurse_type);
      }
  
      if (shift) {
        query += ` AND shift = $${queryParams.length + 1}`;
        queryParams.push(shift);
      }
  
      if (location) {
        query += ` AND location = $${queryParams.length + 1}`;
        queryParams.push(location);
      }
  
      // Run the query
      const result = await pool.query(query, queryParams);
      console.log('Search results:', result.rows);
      return result.rows;
  
    } catch (err) {
      console.error('Error searching nurses:', err);
    }
}

async function send_nurses_message(nurses, nurse_type, shift, location, hospital_name, shift_id, sender, date, start_time, end_time) {
  for (const nurse of nurses) {

    const phoneNumber = nurse.mobile_number; // adjust field name based on your table
    const message = `Hi! A ${nurse_type} nurse is needed for a ${shift} shift at ${hospital_name},${location} on ${date} from ${start_time} to ${end_time}. Reply if you're available.`;
    const nurse_availability = await check_nurse_availability(nurse.id, shift_id);
    if (nurse_availability) {
      await pool.query(`
        INSERT INTO chat_history 
        (sender, receiver, message, shift_id)
        VALUES ($1, $2, $3, $4)
      `, [sender, phoneNumber, message, shift_id]); 
      await pool.query(
        `
        INSERT INTO nurse_chat_history 
        (messages, phone_number, message_type)
        VALUES ($1, $2, $3)
        `,
        [message,phoneNumber,'sent']
      );
      try {
        const response = await axios.post(`${process.env.HOST_MAC}/send_message/`, {
          recipient: phoneNumber,
          message: message,
        });
        console.log(`Message sent to ${phoneNumber}`);
      } catch (error) {
        console.error(`Failed to send message to ${phoneNumber}:`, error.response ? error.response.data : error.message);
      } 
    }
  }
}

async function check_nurse_availability(nurse_id, shift_id) {
  try {
    // Get the date and time range of the new shift
    const { rows: [newShift] } = await pool.query(`
      SELECT date, start_time, end_time 
      FROM shift_tracker 
      WHERE id = $1
    `, [shift_id]);

    if (!newShift) throw new Error(`Shift ID ${shift_id} not found.`);

    const newDate = newShift.date.toISOString().split('T')[0];
    const newStart = newShift.start_time;
    const newEnd = newShift.end_time;

    // Get all assigned shift IDs for the nurse
    const { rows: assignedShifts } = await pool.query(`
      SELECT shift_id 
      FROM nurse_shift_assignments 
      WHERE nurse_id = $1
    `, [nurse_id]);

    for (const row of assignedShifts) {
      const { rows: [assigned] } = await pool.query(`
        SELECT date, start_time, end_time 
        FROM shift_tracker 
        WHERE id = $1
      `, [row.shift_id]);

      if (!assigned) continue;

      const assignedDate = assigned.date.toISOString().split('T')[0];
      const assignedStart = assigned.start_time;
      const assignedEnd = assigned.end_time;

      // Check if it's the same date
      if (assignedDate === newDate) {
        // Check for time overlap: (StartA < EndB) and (StartB < EndA)
        if (
          assignedStart < newEnd &&
          newStart < assignedEnd
        ) {
          return false; // Conflict found
        }
      }
    }

    return true; // No conflicts
  } catch (error) {
    console.error("Error occurred while checking nurse availability:", error);
    return false;
  }
}


module.exports = {
    search_nurses,
    send_nurses_message
}