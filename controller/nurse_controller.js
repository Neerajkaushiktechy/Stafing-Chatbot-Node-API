const { generateMessageForNurseAI } = require('../ai.js');
const pool = require('../db.js');
const axios = require('axios');

async function search_nurses(nurse_type, shift, location) {
  try {
    const result = await pool.query(`
      SELECT *
      FROM nurses
      WHERE nurse_type ILIKE $1 AND shift ILIKE $2 AND location ILIKE $3
    `, [nurse_type, shift, location]);
  
    return result.rows;
  
  } catch (err) {
    console.error('Error searching nurses:', err);
  }
  
}

async function send_nurses_message(nurses, nurse_type, shift, location, hospital_name, shift_id, sender, date, start_time, end_time) {
  for (const nurse of nurses) {

    const phoneNumber = nurse.mobile_number;
    const nurse_availability = await check_nurse_availability(nurse.id, shift_id);
    if (nurse_availability) {
      const result = await pool.query(`
        SELECT message
        FROM nurse_chat_data
        WHERE mobile_number = $1
      `, [phoneNumber]);
      
      const pastMessages = result.rows.map(row => row.message);
      let message = await generateMessageForNurseAI(nurse_type, shift, hospital_name, location, date, start_time, end_time,pastMessages)
      if (typeof message === 'string') {
        message = message.trim();
        if (message.startsWith('```json')) {
            message = message.replace(/```json|```/g, '').trim();
            console.log("JSON reply generated:", message);
        } else if (message.startsWith('```')) {
            message = message.replace(/```/g, '').trim();
            console.log("JSON reply generated:", message);
        }
        try {
            message = JSON.parse(message);
            console.log("Parsed reply generated:", message);
        } catch (parseError) {
            console.error('Failed to parse AI reply:', parseError);
            return res.status(500).json({ ErrorMessage: "Invalid AI response format." });
        }
    }
      const AiMessage = message.message
      console.log("Message from AI for nurse",AiMessage)
      await pool.query(`
        INSERT INTO chat_history 
        (sender, receiver, message, shift_id)
        VALUES ($1, $2, $3, $4)
      `, [sender, phoneNumber, AiMessage, shift_id]); 
      await pool.query(
        `
        INSERT INTO nurse_chat_data 
        (message, mobile_number, message_type)
        VALUES ($1, $2, $3)
        `,
        [AiMessage,phoneNumber,'sent']
      );
      try {
        const response = await axios.post(`${process.env.HOST_MAC}/send_message/`, {
          recipient: phoneNumber,
          message: AiMessage,
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
      SELECT id
      FROM shift_tracker 
      WHERE nurse_id = $1
    `, [nurse_id]);

    for (const row of assignedShifts) {
      const { rows: [assigned] } = await pool.query(`
        SELECT date, start_time, end_time 
        FROM shift_tracker 
        WHERE id = $1
      `, [row.id]);

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