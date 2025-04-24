const pool = require('../db.js');
const axios = require('axios');
require('dotenv').config();
async function update_coordinator(shift_id, nurse_phoneNumber) {
    const nurse = await get_nurse_info(nurse_phoneNumber);
    console.log("Nurse fetched:", nurse);

    await update_shift_status(shift_id, nurse.id);
    const recipient = await get_coordinator_number(shift_id);
    const shiftInfo = await get_shift_information(shift_id);

    if (nurse && shiftInfo) {
        const message = `Hello! Your shift requested at ${shiftInfo.hospital_name}, ${shiftInfo.location}, on ${shiftInfo.date} from ${shiftInfo.start_time} to ${shiftInfo.end_time} will be covered by ${nurse.name}. You can reach out via ${nurse.mobile_number}.`;

        console.log("Message to send:", message);

        try {
              const response = await axios.post(`${process.env.HOST_MAC}/send_message/`, {
                recipient: recipient,
                message: message,
              });
              console.log(`Message sent to ${recipient}`);
              console.log("message sent to", recipient, "message", message)
            } catch (error) {
              console.error(`Failed to send message to ${recipient}:`, error.response ? error.response.data : error.message);
            } 

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

        console.log(`Shift ${shift_id} updated to filled with nurse ${nurse_id}`);
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
        console.log("Recipient:", recipient);
        return recipient;
    } catch (error) {
        console.error("Error fetching coordinator number:", error);
    }
}

async function get_shift_information(shift_id) {
    try {
        const { rows } = await pool.query(`
            SELECT hospital_name, location, date, start_time, end_time
            FROM shift_tracker
            WHERE id = $1
        `, [shift_id]);

        const shiftInfo = rows.length > 0 ? rows[0] : null;
        console.log("Shift information:", shiftInfo);
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
      console.log('Message successfully inserted for coordinator.');
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
        console.log("Coordinator chat history")
        const pastMessages = result.rows.map(row => row.message);
        return pastMessages
    } catch (error) {
        console.error("Error getting coordinator chat data", error)
    }
}

async function validate_shift_before_cancellation(shift_id, phoneNumber){
    const shiftDetails = await pool.query(`
        SELECT created_by
        FROM shift_tracker
        where id = $1
        `,[shift_id])
    const{created_by} = shiftDetails[0]
    if (shiftDetails[0].length == 0){
        try {
            const message = `The shift with ID ${shift_id} does not exist please check and try again`
            const response = await axios.post(`${process.env.HOST_MAC}/send_message/`, {
                recipient: phoneNumber,
                message: message,
            });
            console.log(`Message sent to ${phoneNumber}`);
            } catch (error) {
            console.error(`Failed to send message to ${phoneNumber}:`, error.response ? error.response.data : error.message);
            }
        return false
    }
    if (created_by != phoneNumber){
        try {
        const message = `The shift with ID ${shift_id} does not exist in your database please check and try again`
        const response = await axios.post(`${process.env.HOST_MAC}/send_message/`, {
            recipient: phoneNumber,
            message: message,
        });
        console.log(`Message sent to ${phoneNumber}`);
        } catch (error) {
        console.error(`Failed to send message to ${phoneNumber}:`, error.response ? error.response.data : error.message);
        }
    return false
    }
    else if(created_by == phoneNumber){
        return true
    }
}
module.exports = {
    update_coordinator, update_coordinator_chat_history, get_coordinator_chat_data, validate_shift_before_cancellation
};
