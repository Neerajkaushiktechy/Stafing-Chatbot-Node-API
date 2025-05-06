const pool = require('../db.js');
const { sendMessage } = require('../services/sendMessageAPI.js');
require('dotenv').config();


async function update_coordinator(shift_id, nurse_phoneNumber) {
    const nurse = await get_nurse_info(nurse_phoneNumber);

    await update_shift_status(shift_id, nurse.id);
    const recipient = await get_coordinator_number(shift_id);
    const shiftInfo = await get_shift_information(shift_id);

    if (nurse && shiftInfo) {
        const message = `Hello! Your shift requested at ${shiftInfo.name}, ${shiftInfo.location}, on ${shiftInfo.date} for ${shiftInfo.shift} shift has been filled. This shift will be covered by ${nurse.first_name}. You can reach out via ${nurse.mobile_number}.`;

        await sendMessage(recipient, message);
    } else {
        console.error("Missing nurse or shift information. Cannot send message.");
    }
}

async function get_nurse_info(nurse_phoneNumber) {
    try {
        const { rows } = await pool.query(
            `SELECT * 
             FROM nurses 
             WHERE mobile_number = $1 
             LIMIT 1`,
            [nurse_phoneNumber]
        );

        const nurse = rows.length > 0 ? rows[0] : null;
        return nurse;
    } catch (error) {
        console.error("Error fetching nurse information", error);
    }
}

async function update_shift_status(shift_id, nurse_id) {
    try {
        await pool.query(`
            UPDATE shift_tracker
            SET status = 'filled',
                nurse_id = $2
            WHERE id = $1
        `, [shift_id, nurse_id]);
    } catch (error) {
        console.error('Error updating shift status:', error);
    }
}

async function get_coordinator_number(shift_id) {
    try {
        const { rows } = await pool.query(`
            SELECT created_by 
            FROM shift_tracker
            WHERE id = $1
        `, [shift_id]);
        
        const recipient = rows.length > 0 ? rows[0].created_by : null;
        return recipient;
    } catch (error) {
        console.error("Error fetching coordinator number:", error);
    }
}

async function get_shift_information(shift_id) {
    try {
        const { rows } = await pool.query(`
            SELECT location, date, shift, name
            FROM shift_tracker
            WHERE id = $1
        `, [shift_id]);

        const shiftInfo = rows.length > 0 ? rows[0] : null;
        return shiftInfo;
    } catch (error) {
        console.error("Error fetching shift information:", error);
    }
}

async function update_coordinator_chat_history(sender, text, type) {
    try {
      await pool.query(`
        INSERT INTO coordinator_chat_data
        (sender, message, message_type)
        VALUES ($1, $2, $3)
      `, [sender, text, type]);
    } catch (err) {
      console.error('Error updating coordinator chat history:', err);
    }
  }

async function get_coordinator_chat_data(sender){
    try {
        const result = await pool.query(`
            SELECT message from coordinator_chat_data
            WHERE sender = $1
            `,[sender])
        const pastMessages = result.rows.map(row => row.message);
        return pastMessages
    } catch (error) {
        console.error("Error getting coordinator chat data", error)
    }
}

async function validate_shift_before_cancellation(shift_id, phoneNumber) {
    const result = await pool.query(`
      SELECT created_by
      FROM shift_tracker
      WHERE id = $1
    `, [shift_id]);
  
    if (result.rows.length === 0) {
      const message = `The shift with ID ${shift_id} does not exist. Please check and try again.`;
      await sendMessage(phoneNumber, message);
      return false;
    }
  
    const { created_by } = result.rows[0];
  
    if (created_by !== phoneNumber) {
      const message = `The shift with ID ${shift_id} does not belong to your account. Please check and try again.`;
      await sendMessage(phoneNumber,message)
      return false;
    }
  
    return true;
  }
  
async function check_nurse_type(sender,nurse_type) {
    const { rows } = await pool.query(`
        SELECT * 
        FROM nurse_type 
        WHERE nurse_type = $1
    `, [nurse_type]);
    if (rows.length === 0) {
        return false;
    }
    const facility = await pool.query(`
        SELECT id
        FROM facilities 
        WHERE phone = $1 OR email = $1
        `, [sender]);
    const facility_id = facility.rows[0].id;
    const result = await pool.query(`
        SELECT * 
        FROM shifts 
        WHERE role = $1 
        AND facility_id = $2
    `, [nurse_type, facility_id]);
    if (result.rows.length === 0) {
        return false;
    }
    return true;
}
module.exports = {
    update_coordinator, 
    update_coordinator_chat_history, 
    get_coordinator_chat_data, 
    validate_shift_before_cancellation,
    check_nurse_type
};
