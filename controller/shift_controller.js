const pool = require('../db.js');
const { search_nurses, send_nurses_message, check_nurse_availability } = require('./nurse_controller.js');
const { update_coordinator_chat_history } = require('./coordinator_controller.js');
const { sendMessage } = require('../services/sendMessageAPI.js');

async function create_shift(created_by,nurse_type, shift,date, additional_instructions, nurse_id=null, status="open")
{
    try {
      const {rows: facility} = await pool.query(`
        SELECT facility_id,id
        FROM coordinator
        Where coordinator_phone = $1 OR coordinator_email = $1
      `, [created_by]);  
      const facility_id = facility[0].facility_id;
      const coordinator_id = facility[0].id;
        const result = await pool.query(`
          INSERT INTO shift_tracker 
          (nurse_type, shift, nurse_id, status, date, facility_id, coordinator_id, booked_by, additional_instructions)
          VALUES ($1, $2, $3, $4, $5, $6,$7,$8, $9)
          RETURNING id
        `, [nurse_type, shift, nurse_id, status, date,facility_id,coordinator_id,'bot',additional_instructions]);
    
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

async function search_shift(nurse_type, shift,date,created_by) {
  const {rows: facility} = await pool.query(`
    SELECT facility_id
    FROM coordinator
    Where coordinator_phone = $1 OR coordinator_email = $1
  `, [created_by]);  
  const facility_id = facility[0].facility_id;
  const { rows } = await pool.query(`
    SELECT * FROM shift_tracker
    WHERE nurse_type ILIKE $1
      AND shift ILIKE $2
      AND date = $3
      AND facility_id = $4
  `, [nurse_type, shift,date, facility_id]);

  if (rows.length > 0 ) {
    const {rows: facility} = await pool.query(`
      SELECT city_state_zip, name
      FROM facilities
      WHERE id = $1
    `, [facility_id]);
    const location = facility[0]?.city_state_zip || '';
    const name = facility[0]?.name || '';
      if (rows.length === 1){
        const shift_id = rows[0].id;
        const nurse_id = rows[0].nurse_id;
        await delete_shift(shift_id,created_by,nurse_id,nurse_type,shift,location,date, name);
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
                nurse_name = result.rows[0].first_name;
              }
            } catch (err) {
              console.error(`Error fetching nurse name for id ${shift.nurse_id}:`, err.message);
            }
          }
      
          message += `${i + 1}. ${shift.nurse_type} nurse (${nurse_name}) at ${name}, ${location} on ${shift.date}\n ID:${shift.id}\n`;
        }
      
        message += `\nPlease reply with the number of the shift you'd like to cancel.`;
        await update_coordinator_chat_history(created_by, message, 'sent')
        await sendMessage(created_by, message)
      }
      
  } else {
    const message = `The cancellation request you raised for the ${nurse_type} nurse for ${shift} shift scheduled on ${date} does not exist or has been deleted already.`;
    await sendMessage(created_by,message)
  }
}

async function delete_shift(shift_id,created_by,nurse_id,nurse_type,shift_value,location,date,name) {
  try {
    await pool.query(`DELETE FROM shift_tracker WHERE id = $1`, [shift_id]);
    const message = `The cancellation request you raised for the ${nurse_type} nurse for ${shift_value} at ${location} scheduled on ${date} has been cancelled succesfully`
    await sendMessage(created_by,message)
        
       if (nurse_id){
          const {rows} = await pool.query(
            `SELECT mobile_number
            FROM nurses
            WHERE id = $1
            `, [nurse_id]
          )
          const nurse_phoneNumber = rows[0].mobile_number
          const message = `The shift you confirmed scheduled on ${date} at ${name},${location} has been cancelled by the coordinator. We are sorry for any inconvinience caused`
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
    const facility_id = rows[0].facility_id;
    const date = rows[0].date;
    const {rows: facility} = await pool.query(`
      SELECT city_state_zip, name
      FROM facilities
      WHERE id = $1
    `, [facility_id]);
    const location = facility[0]?.city_state_zip || '';
    const name = facility[0]?.name || '';
    await delete_shift(shift_id,created_by,nurse_id,nurse_type,shift_value,location,date,name);
}
async function shift_cancellation_nurse(nurse_type, shift,date, phoneNumber) {
  try {
    const {rows: nurse} = await pool.query(`
      SELECT * FROM nurses
      WHERE mobile_number = $1`,
      [phoneNumber])
    const {id: nurse_id} = nurse[0]
    const { rows } = await pool.query(`
      SELECT * FROM shift_tracker
      WHERE nurse_type ILIKE $1
        AND shift ILIKE $2
        AND date = $3
        AND nurse_id = $4
    `, [nurse_type, shift, date, nurse_id]);

    if (rows.length === 0) {
      // 🔹 Improvement: Early return to avoid nesting
      const message = `The cancellation request you raised for the ${nurse_type} nurse for ${shift} shift scheduled on ${date} does not exist or has been deleted already.`;
      await sendMessage(phoneNumber, message);
      return;
    }

    const shiftDetails = rows[0];
    const { id: shift_id,facility_id, coordinator_id } = shiftDetails;

    // 🔹 Update shift status
    await pool.query(`
      UPDATE shift_tracker 
      SET status = 'open',
          nurse_id = null
      WHERE id = $1;
    `, [shift_id]);
    
    const { rows: facility } = await pool.query(`
      SELECT city_state_zip, name
      FROM facilities
      WHERE id = $1
    `, [facility_id]);
    const location = facility[0]?.city_state_zip || '';
    const name = facility[0]?.name || '';
    // 🔹 Message to nurse
    const messageToNurse = `The shift you confirmed at ${name}, ${location} on ${date} for ${nurse_type} has been cancelled.`;
    await sendMessage(phoneNumber, messageToNurse)

    // 🔹 Fetch nurses and exclude sender
    let nurses = await search_nurses(nurse_type, shift, shift_id);
    nurses = nurses.filter(nurse => nurse.mobile_number !== phoneNumber);

    // 🔹 Message to other nurses
    await send_nurses_message(nurses, nurse_type, shift, shift_id, date);
    const { rows: coordinator } = await pool.query(`
      SELECT coordinator_phone, coordinator_email
      FROM coordinator
      WHERE id = $1
    `, [coordinator_id]);
    const coordinator_phone = coordinator[0].coordinator_phone;
    const coordinator_email = coordinator[0].coordinator_email;
    // 🔹 Notify hospital/requester
    const messageToCreator = `Hello! Your shift request at ${name}, ${location}, on ${date} for a ${nurse_type} nurse has been cancelled by the nurse. We are looking for another to help cover it. Sorry for any inconvenience caused.`;
    await sendMessage(coordinator_email, messageToCreator);
    await sendMessage(coordinator_phone, messageToCreator);

  } catch (error) {
    console.error("Error cancelling nurse confirmed shift:", error);
  }
}

async function check_shift_validity(shift_id, nursePhoneNumber) {
  const shiftQuery = await pool.query(`
    SELECT shift, facility_id, nurse_type
    FROM shift_tracker
    WHERE id = $1
  `, [shift_id]);

  if (shiftQuery.rows.length === 0) {
    const message = `The shift with ID ${shift_id} does not exist try putting in a valid shift ID.`;
    await sendMessage(nursePhoneNumber, message);
    return false;
  }
  const { shift, facility_id, nurse_type: type } = shiftQuery.rows[0];

  const nurseQuery = await pool.query(`
    SELECT id, shift, location, nurse_type
    FROM nurses
    WHERE mobile_number = $1
  `, [nursePhoneNumber]);

  if (nurseQuery.rows.length === 0) return false;
  const {rows:location} = await pool.query(`
    SELECT city_state_zip
    FROM facilities
    WHERE id = $1
  `, [facility_id]);
  const facilityLocation = location[0].city_state_zip;
  const {
    id: nurseId,
    shift: nurseShift,
    location: nurseLocation,
    nurse_type: nurseType,
  } = nurseQuery.rows[0];
  const [city, state, zip] = facilityLocation.split(',').map(part => part.trim()).filter(Boolean);
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