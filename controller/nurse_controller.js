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

    const { rows: facilityRows } = await pool.query(`
      SELECT lat, lng FROM facilities
      WHERE id = $1
    `, [facility_id]);
    
    const facility = facilityRows[0];
    if (!facility || !facility.lat || !facility.lng) {
      throw new Error('Facility does not have valid coordinates.');
    }
    const { rows: nurseCandidates } = await pool.query(`
      SELECT n.*
      FROM nurses n
      WHERE n.nurse_type ILIKE $3
        AND n.shift ILIKE $4
  AND (
    3959 * acos(
      cos(radians($1)) * cos(radians(n.lat)) *
      cos(radians(n.lng) - radians($2)) +
      sin(radians($1)) * sin(radians(n.lat))
    )
  ) <= 50
    `, [facility.lat, facility.lng, nurse_type, shift]);

    return nurseCandidates;

  } catch (err) {
    console.error('Error searching nurses:', err);
  }
}


async function send_nurses_message(nurses, nurse_type, shift, shift_id, date, additional_instructions) {
  for (const nurse of nurses) {

    const phoneNumber = nurse.mobile_number;
    const nurse_availability = await check_nurse_availability(nurse.id, shift_id);
    if (nurse_availability) {
      const pastMessages = await get_nurse_chat_data(phoneNumber)
      let message = await generateMessageForNurseAI(nurse_type, shift, date,pastMessages,shift_id, additional_instructions)
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

async function follow_up_reply(sender,message){
  const {rows: nurse} = await pool.query(`
  SELECT id
  FROM nurses
  WHERE mobile_number = $1
  `,[sender])
  const nurse_id = nurse[0].id
  const {rows: shifts} = await pool.query(`
    SELECT coordinator_id
    FROM shift_tracker
    WHERE nurse_id = $1
    AND date = CURRENT_DATE
  `,[nurse_id])

  const coordinator_id = shifts[0].coordinator_id
  const {rows: coordinator} = await pool.query(`
    SELECT coordinator_email, coordinator_phone
    FROM coordinator
    WHERE id = $1
  `,[coordinator_id])
  const coordinator_email = coordinator[0].coordinator_email
  const coordinator_phone = coordinator[0].coordinator_phone
  await sendMessage(coordinator_phone,message)
  return {
    coordinator_email,
    coordinator_phone
  }
}
module.exports = {
    search_nurses,
    send_nurses_message,
    update_nurse_chat_history,
    get_nurse_chat_data,
    check_nurse_availability,
    follow_up_reply

}