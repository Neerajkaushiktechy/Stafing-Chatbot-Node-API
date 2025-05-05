const pool = require('../db.js');
const { search_nurses, send_nurses_message, check_nurse_availability } = require('./nurse_controller.js');
const { update_coordinator_chat_history } = require('./coordinator_controller.js');
const { sendMessage } = require('../services/sendMessageAPI.js');

async function create_shift(created_by,nurse_type, shift,date, nurse_id=null, status="open")
{
    try {
        const { rows } = await pool.query(`
          SELECT city_state_zip, name
          FROM facilities
          WHERE phone = $1 OR email = $1
          `,[created_by])
        const location = rows[0].city_state_zip
        const name = rows[0].name
        const result = await pool.query(`
          INSERT INTO shift_tracker 
          (created_by, nurse_type, shift, nurse_id, status, date,location,name)
          VALUES ($1, $2, $3, $4, $5, $6,$7,$8)
          RETURNING id
        `, [created_by,nurse_type, shift, nurse_id, status, date,location,name]);
    
        return result.rows[0].id;
    }catch (err) {
        console.error('Error creating tables:', err);
      }
}

async function check_shift_status(shift_id, phoneNumber) {
  const { rows } = await pool.query(
    `SELECT status
     FROM shift_tracker
     WHERE id = $1`,
    [shift_id]
  );

  if (rows.length > 0) {
    return rows[0].status;
  } else {
    const message = "The shift ID you provided does not match any of the shifts. Make sure you have provided the correct ID"
    await sendMessage(phoneNumber,message)
  }
}

async function search_shift(nurse_type, shift, location, hospital_name, date, start_time, end_time, created_by) {
  const { rows } = await pool.query(`
    SELECT * FROM shift_tracker
    WHERE nurse_type ILIKE $1
      AND shift ILIKE $2
      AND location ILIKE $3
      AND hospital_name ILIKE $4
      AND date = $5
      AND start_time = $6
      AND end_time = $7
      AND created_by = $8
  `, [nurse_type, shift, location, hospital_name, date, start_time, end_time, created_by]);

  if (rows.length > 0 ) {
      if (rows.length === 1){
        const shift_id = rows[0].id;
        const nurse_id = rows[0].nurse_id;
        const nurse_type = rows[0].nurse_type;
        const shift_value = rows[0].shift;
        const hospital_name = rows[0].hospital_name;
        const location = rows[0].location;
        const date = rows[0].date;
        const start_time = rows[0].start_time;
        const end_time = rows[0].end_time;
        await delete_shift(shift_id,created_by,nurse_id,nurse_type,shift_value,hospital_name,location,date,start_time,end_time);
      }
      else if (rows.length > 1) {
        let message = `We found multiple shifts matching your request:\n\n`;
      
        for (let i = 0; i < rows.length; i++) {
          const shift = rows[i];
      
          let nurse_name = "Not assigned";
          if (shift.nurse_id) {
            try {
              const result = await pool.query(
                `SELECT first_name FROM nurses WHERE id = $1`,
                [shift.nurse_id]
              );
              if (result.rows.length > 0) {
                nurse_name = result.rows[0].name;
              }
            } catch (err) {
              console.error(`Error fetching nurse name for id ${shift.nurse_id}:`, err.message);
            }
          }
      
          message += `${i + 1}. ${shift.nurse_type} nurse (${nurse_name}) at ${shift.hospital_name}, ${shift.location} on ${shift.date} from ${shift.start_time} to ${shift.end_time}\n ID:${shift.id}\n`;
        }
      
        message += `\nPlease reply with the number of the shift you'd like to cancel.`;
        await update_coordinator_chat_history(created_by, message, 'sent')
        await sendMessage(created_by, message)
      }
      
  } else {
    const message = `The cancellation request you raised for the ${nurse_type} nurse for ${shift} shift at ${hospital_name}, ${location} scheduled on ${date} from ${start_time} to ${end_time} does not exist or has been deleted already`
    await sendMessage(created_by,message)
  }
}

async function delete_shift(shift_id,created_by,nurse_id,nurse_type,shift_value,hospital_name,location,date,start_time,end_time) {
  try {
    await pool.query(`DELETE FROM shift_tracker WHERE id = $1`, [shift_id]);
    const message = `The cancellation request you raised for the ${nurse_type} nurse for ${shift_value} shift at ${hospital_name}, ${location} scheduled on ${date} from ${start_time} to ${end_time} has been cancelled succesfully`
    await sendMessage(created_by,message)
        
       if (nurse_id){
          const {rows} = await pool.query(
            `SELECT mobile_number
            FROM nurses
            WHERE id = $1
            `, [nurse_id]
          )
          const nurse_phoneNumber = rows[0].mobile_number
          const message = `The shift you confirmed at ${hospital_name}, ${location} scheduled on ${date} from ${start_time} to ${end_time} has been cancelled by the coordinator. We are sorry for any inconvinience caused`
          await sendMessage(nurse_phoneNumber,message)
       }
     
  } catch (error) {
    console.error('Error deleting shift:', error);
  }
}


async function search_shift_by_id(shift_id, created_by){
  const {rows} = await pool.query(`
    SELECT * FROM shift_tracker
    WHERE id = $1
    `,[shift_id])

    const nurse_id = rows[0].nurse_id;
    const nurse_type = rows[0].nurse_type;
    const shift_value = rows[0].shift;
    const hospital_name = rows[0].hospital_name;
    const location = rows[0].location;
    const date = rows[0].date;
    const start_time = rows[0].start_time;
    const end_time = rows[0].end_time;
    await delete_shift(shift_id,created_by,nurse_id,nurse_type,shift_value,hospital_name,location,date,start_time,end_time);
}
async function shift_cancellation_nurse(nurse_type, shift, location, hospital_name, date, start_time, end_time, sender) {
  try {
    // 🔹 Improvement: Destructuring first row directly if found
    const { rows } = await pool.query(`
      SELECT * FROM shift_tracker
      WHERE nurse_type ILIKE $1
        AND shift ILIKE $2
        AND location ILIKE $3
        AND hospital_name ILIKE $4
        AND date = $5
        AND start_time = $6
        AND end_time = $7
    `, [nurse_type, shift, location, hospital_name, date, start_time, end_time]);

    if (rows.length === 0) {
      // 🔹 Improvement: Early return to avoid nesting
      const message = `The cancellation request you raised for the ${nurse_type} nurse for ${shift} shift at ${hospital_name}, ${location} scheduled on ${date} from ${start_time} to ${end_time} does not exist or has been deleted already.`;
      await sendMessage(sender, message);
      return;
    }

    const shiftDetails = rows[0]; // use a cleaner variable name
    const { id: shift_id, nurse_id, created_by } = shiftDetails;

    // 🔹 Improvement: Get nurse number and check match
    const nurse_number_result = await pool.query(`
      SELECT mobile_number FROM nurses WHERE id = $1
    `, [nurse_id]);

    if (nurse_number_result.rows.length === 0) return;

    const fetched_number = nurse_number_result.rows[0].mobile_number;

    if (fetched_number !== sender) {
      const message = `The shift you are trying to cancel is not assigned to you or does not exist.`;
      await sendMessage(sender, message);
      return;
    } // 🔹 Early exit if sender is not the assigned nurse

    // 🔹 Update shift status
    await pool.query(`
      UPDATE shift_tracker 
      SET status = 'open',
          nurse_id = null
      WHERE id = $1;
    `, [shift_id]);
    

    // 🔹 Message to nurse
    const messageToNurse = `The shift you confirmed at ${hospital_name}, ${location}, on ${date} from ${start_time} to ${end_time} for ${nurse_type} has been cancelled.`;
    await sendMessage(sender, messageToNurse)

    // 🔹 Fetch nurses and exclude sender
    let nurses = await search_nurses(nurse_type, shift, location);
    nurses = nurses.filter(nurse => nurse.mobile_number !== sender);

    // 🔹 Message to other nurses
    await send_nurses_message(nurses, nurse_type, shift, location, hospital_name, shift_id, sender, date, start_time, end_time);

    // 🔹 Notify hospital/requester
    const messageToCreator = `Hello! Your shift request at ${hospital_name}, ${location}, on ${date} from ${start_time} to ${end_time} for a ${nurse_type} nurse has been cancelled by the nurse. We are looking for another to help cover it. Sorry for any inconvenience caused.`;
    await sendMessage(created_by, messageToCreator);

  } catch (error) {
    console.error("Error cancelling nurse confirmed shift:", error);
  }
}

async function check_shift_validity(shift_id, nursePhoneNumber) {
  const shiftQuery = await pool.query(`
    SELECT shift, location, nurse_type
    FROM shift_tracker
    WHERE id = $1
  `, [shift_id]);

  if (shiftQuery.rows.length === 0) {
    const message = `The shift with ID ${shift_id} does not exist try putting in a valid shift ID.`;
    await sendMessage(nursePhoneNumber, message);
    return false;
  }
  console.log("SHIFT QUERY", shiftQuery.rows[0])
  const { shift, location, nurse_type: type } = shiftQuery.rows[0];

  const nurseQuery = await pool.query(`
    SELECT id, shift, location, nurse_type
    FROM nurses
    WHERE mobile_number = $1
  `, [nursePhoneNumber]);

  if (nurseQuery.rows.length === 0) return false;

  const {
    id: nurseId,
    shift: nurseShift,
    location: nurseLocation,
    nurse_type: nurseType,
  } = nurseQuery.rows[0];
  const [city, state, zip] = location.split(',').map(part => part.trim()).filter(Boolean);
  const locationMatch =
  nurseLocation.toLowerCase().includes(city?.toLowerCase() || '') ||
  nurseLocation.toLowerCase().includes(state?.toLowerCase() || '') ||
  nurseLocation.toLowerCase().includes(zip?.toLowerCase() || '');

  if (
    shift.toLowerCase() !== nurseShift.toLowerCase() ||
    !locationMatch ||
    type.toLowerCase() !== nurseType.toLowerCase()
  ) {
    const message = `The shift with ID ${shift_id} does not match your details. Please resend the message with a shift ID of a shift offered to you.`;
    await sendMessage(nursePhoneNumber, message);
    return false;
  }

  const availability = await check_nurse_availability(nurseId, shift_id);

  if (!availability) {
    const message = `The shift with ID ${shift_id} conflicts with your other shift and thus cannot be completed by you.`;
    await sendMessage(nursePhoneNumber, message);
    return false;
  }

  return true;
}

module.exports = {
    create_shift,
    check_shift_status,
    search_shift,
    shift_cancellation_nurse,
    search_shift_by_id,
    delete_shift,
    check_shift_validity
}