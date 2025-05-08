const { generateMessageForNurseAI } = require('../helper/promptHelper.js');
const pool = require('../db.js');
const { sendMessage } = require('../services/sendMessageAPI.js');
require('dotenv').config();
async function search_nurses(nurse_type, shift, shift_id) {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM shift_tracker
      WHERE id = $1
    `, [shift_id]);
    
    const { facility_id } = rows[0];

    const { rows: addressRows } = await pool.query(`
      SELECT city_state_zip FROM facilities
      WHERE id = $1
    `, [facility_id]);

    const full_location = addressRows[0]?.city_state_zip || '';

    // Split location into parts like ["Brooklyn", "NYC", "1231"]
    const [city, state, zip] = full_location.split(',').map(part => part.trim()).filter(Boolean);
    const result = await pool.query(`
      SELECT *
      FROM nurses
      WHERE nurse_type ILIKE $1
        AND shift ILIKE $2
        AND (
          location ILIKE $3
          OR location ILIKE $4
          OR location ILIKE $5
        )
    `, [nurse_type, shift, `%${city}%`, `%${state}%`, `%${zip}%`]);

    return result.rows;

  } catch (err) {
    console.error('Error searching nurses:', err);
  }
}


async function send_nurses_message(nurses, nurse_type, shift, shift_id, date) {
  for (const nurse of nurses) {

    const phoneNumber = nurse.mobile_number;
    const nurse_availability = await check_nurse_availability(nurse.id, shift_id);
    if (nurse_availability) {
      const pastMessages = await get_nurse_chat_data(phoneNumber)
      let message = await generateMessageForNurseAI(nurse_type, shift, date,pastMessages,shift_id)
      if (typeof message === 'string') {
        message = message.trim();
        if (message.startsWith('```json')) {
            message = message.replace(/```json|```/g, '').trim();
        } else if (message.startsWith('```')) {
            message = message.replace(/```/g, '').trim();
        }
        try {
            message = JSON.parse(message);
        } catch (parseError) {
            console.error('Failed to parse AI reply:', parseError);
        }
    }
      const AiMessage = message.message
      await update_nurse_chat_history(phoneNumber, AiMessage, 'sent')
      await sendMessage(phoneNumber, AiMessage)
    }
  }
}

async function check_nurse_availability(nurse_id, shift_id) {
  try {
    // Get the date of the new shift
    const { rows: [newShift] } = await pool.query(`
      SELECT date
      FROM shift_tracker 
      WHERE id = $1
    `, [shift_id]);

    if (!newShift) throw new Error(`Shift ID ${shift_id} not found.`);

    const date = newShift.date
    // Check if the nurse already has a shift on that date (excluding the current shift if updating)
    const { rows } = await pool.query(`
      SELECT *
      FROM shift_tracker
      WHERE nurse_id = $1 AND date = $2
    `, [nurse_id, date]);
    // If any row is returned, there's a conflict
    return rows.length === 0;

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