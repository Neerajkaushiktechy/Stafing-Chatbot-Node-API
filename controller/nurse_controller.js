const { generateMessageForNurseAI } = require('../helper/promptHelper.js');
const pool = require('../db.js');
const { sendMessage } = require('../services/sendMessageAPI.js');
require('dotenv').config();
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
      const pastMessages = await get_nurse_chat_data(phoneNumber)
      let message = await generateMessageForNurseAI(nurse_type, shift, hospital_name, location, date, start_time, end_time,pastMessages,shift_id)
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
      await update_nurse_chat_history(phoneNumber, AiMessage, 'sent')
      await sendMessage(phoneNumber, AiMessage)
    }
  }
}

async function check_nurse_availability(nurse_id, shift_id) {
  try {
    console.log("Checking availability")
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
          console.log("shift conflicts")
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

async function update_nurse_chat_history(sender, text, type) {
  try {
    await pool.query(`
      INSERT INTO nurse_chat_data
      (mobile_number, message, message_type)
      VALUES ($1, $2, $3)
    `, [sender, text, type]);
    console.log('Message successfully inserted for coordinator.');
  } catch (err) {
    console.error('Error updating coordinator chat history:', err);
  }
}

async function get_nurse_chat_data(sender){
  try {
      const result = await pool.query(`
          SELECT message from nurse_chat_data
          WHERE mobile_number = $1
          `,[sender])
      console.log("Coordinator chat history")
      const pastMessages = result.rows.map(row => row.message);
      return pastMessages
  } catch (error) {
      console.error("Error getting coordinator chat data", error)
  }
}

module.exports = {
    search_nurses,
    send_nurses_message,
    update_nurse_chat_history,
    get_nurse_chat_data,
    check_nurse_availability

}