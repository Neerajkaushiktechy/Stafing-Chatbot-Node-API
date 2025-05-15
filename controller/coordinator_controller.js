const pool = require('../db.js');
const { sendMessage } = require('../services/sendMessageAPI.js');
require('dotenv').config();
const {generateFollowUpMessageForNurse} = require('../helper/promptHelper.js')

async function update_coordinator(shift_id, nurse_phoneNumber) {
    const nurse = await get_nurse_info(nurse_phoneNumber);

    await update_shift_status(shift_id, nurse.id);
    const recipient = await get_coordinator_number(shift_id);
    const shiftInfo = await get_shift_information(shift_id);

    if (nurse && shiftInfo) {
        const message = `Hello! Your shift requested at ${shiftInfo.name}, ${shiftInfo.location}, on ${shiftInfo.date} for ${shiftInfo.shift} shift has been filled. This shift will be covered by ${nurse.first_name}. You can reach out via ${nurse.mobile_number}.`;
        await sendMessage(recipient.coordinator_phone, message);
        await sendMessage(recipient.coordinator_email, message);
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
            SELECT coordinator_id 
            FROM shift_tracker
            WHERE id = $1
        `, [shift_id]);
        const coordinator_id = rows[0].coordinator_id;
        const { rows: coordinator } = await pool.query(`
            SELECT coordinator_phone, coordinator_email
            FROM coordinator
            WHERE id = $1
        `, [coordinator_id]);
        const coordinator_phone = coordinator[0].coordinator_phone;
        const coordinator_email = coordinator[0].coordinator_email;
        if (coordinator_phone && coordinator_email) {
            return {
              coordinator_phone,
              coordinator_email
            };
          } else {
            return null; // or undefined, or handle it however you need
          }
    } catch (error) {
        console.error("Error fetching coordinator number:", error);
    }
}

async function get_shift_information(shift_id) {
    try {
        const { rows: facility } = await pool.query(`
            SELECT city_state_zip, name
            FROM facilities
            WHERE id = (SELECT facility_id FROM shift_tracker WHERE id = $1)
        `, [shift_id]);
        const location = facility[0]?.city_state_zip || '';
        const name = facility[0]?.name || '';
        const { rows } = await pool.query(`
            SELECT date, shift
            FROM shift_tracker
            WHERE id = $1
        `, [shift_id]);

        const shiftInfo = {
            date: rows[0].date,
            shift: rows[0].shift,
            location: location,
            name: name
        };
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
    const {rows: coordinator} = await pool.query(`
        SELECT facility_id
        FROM coordinator
        WHERE coordinator_phone = $1 OR coordinator_email = $1
    `, [phoneNumber]);
    const facility_id_coordinator = coordinator[0].facility_id;
    const result = await pool.query(`
      SELECT facility_id
      FROM shift_tracker
      WHERE id = $1
    `, [shift_id]);
  
    if (result.rows.length === 0) {
      const message = `The shift with ID ${shift_id} does not exist. Please check and try again.`;
      await sendMessage(phoneNumber, message);
      return false;
    }
  
    const { facility_id } = result.rows[0];
  
    if (facility_id !== facility_id_coordinator) {
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
        SELECT facility_id
        FROM coordinator 
        WHERE coordinator_phone = $1 OR coordinator_email = $1
        `, [sender]);
    const facility_id = facility.rows[0].facility_id;
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

async function follow_up_message_send(sender, nurse_name_input, follow_up_message) {
  // Get coordinator ID
  const { rows: coordinator } = await pool.query(`
    SELECT id
    FROM coordinator
    WHERE coordinator_phone = $1 OR coordinator_email = $1
  `, [sender]);

  if (coordinator.length === 0) {
    console.log('Coordinator not found.');
    return;
  }

  const coordinator_id = coordinator[0].id;

  // Get matching shifts for today with nurse and facility info
  const { rows: matchingShifts } = await pool.query(`
    SELECT 
      s.id AS shift_id,
      n.first_name,
      n.last_name,
      n.mobile_number,
      n.email,
      f.name,
      s.date
    FROM shift_tracker s
    JOIN nurses n ON s.nurse_id = n.id
    JOIN facilities f ON s.facility_id = f.id
    WHERE s.coordinator_id = $1
      AND s.date = CURRENT_DATE
      AND (
        LOWER(n.first_name) = LOWER($2) OR
        LOWER(CONCAT(n.first_name, ' ', n.last_name)) = LOWER($2)
      )
  `, [coordinator_id, nurse_name_input]);

  if (matchingShifts.length === 0) {
    await sendMessage(sender, `No shift for ${nurse_name_input} found for today.`);
    console.log('No matching nurse shift found for today.');
    return;
  }

  const sentTo = new Set(); // to prevent duplicate sends per nurse

  for (const shift of matchingShifts) {
    const { first_name, last_name, name:facility_name, mobile_number, email } = shift;
    const full_name = `${first_name} ${last_name}`;

    const recipientKey = `${full_name}_${mobile_number}_${email}`;
    if (sentTo.has(recipientKey)) continue;

    try {
      let replyMessage = await generateFollowUpMessageForNurse(full_name, follow_up_message, facility_name);
            if (typeof replyMessage === 'string') {
            replyMessage = replyMessage.trim();
            if (replyMessage.startsWith('```json')) {
                replyMessage = replyMessage.replace(/```json|```/g, '').trim();
            } else if (replyMessage.startsWith('```')) {
                replyMessage = replyMessage.replace(/```/g, '').trim();
            }
            try {
                replyMessage = JSON.parse(replyMessage);
            } catch (parseError) {
                console.error('Failed to parse AI reply:', parseError);
                return res.status(500).json({ message: "Invalid AI response format." });
            }
        }
        console.log("replyMessage",replyMessage)
      if (mobile_number) await sendMessage(mobile_number, replyMessage.message);
      if (email) await sendMessage(email, replyMessage.message);

      sentTo.add(recipientKey);
    } catch (err) {
      console.error(`Failed to send message to ${full_name}:`, err);
    }
  }
}


module.exports = {
    update_coordinator, 
    update_coordinator_chat_history, 
    get_coordinator_chat_data, 
    validate_shift_before_cancellation,
    check_nurse_type,
    follow_up_message_send
};
