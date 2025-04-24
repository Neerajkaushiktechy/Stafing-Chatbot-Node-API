const express = require('express');
const { generateReplyFromAI } = require('../helper/promptHelper.js');
const router = express.Router();
const { search_nurses, send_nurses_message } = require('../controller/nurse_controller.js');
const { create_shift, search_shift, search_shift_by_id} = require('../controller/shift_controller.js');
const { update_coordinator_chat_history, get_coordinator_chat_data, validate_shift_before_cancellation } = require('../controller/coordinator_controller.js');
router.post('/chat', async (req, res) => {
    const { sender, text } = req.body; 

    console.log('Received:', sender, text);

    await update_coordinator_chat_history(sender,text, "received")
    const pastMessages = await get_coordinator_chat_data(sender)
    try {
        let replyMessage = await generateReplyFromAI(text,pastMessages);
        console.log("Raw reply generated:", replyMessage);

        // Check if replyMessage is a string and starts with ```json
        if (typeof replyMessage === 'string') {
            replyMessage = replyMessage.trim();
            if (replyMessage.startsWith('```json')) {
                replyMessage = replyMessage.replace(/```json|```/g, '').trim();
                console.log("JSON reply generated:", replyMessage);
            } else if (replyMessage.startsWith('```')) {
                replyMessage = replyMessage.replace(/```/g, '').trim();
                console.log("JSON reply generated:", replyMessage);
            }
            try {
                replyMessage = JSON.parse(replyMessage);
                console.log("Parsed reply generated:", replyMessage);
            } catch (parseError) {
                console.error('Failed to parse AI reply:', parseError);
                return res.status(500).json({ message: "Invalid AI response format." });
            }
        }
        res.json({ message: replyMessage.message });
        if (replyMessage.nurse_details) {
            const nurseDetailsArray = Array.isArray(replyMessage.nurse_details) ? replyMessage.nurse_details : [replyMessage.nurse_details];
          
            for (const nurseDetail of nurseDetailsArray) {
              const { nurse_type, shift, location, hospital_name, date, start_time, end_time } = nurseDetail;
              const nurse = { nurse_type, shift, location, hospital_name, date, start_time, end_time };
          
              console.log('Nurse details:', nurse);
          
              const shift_id = await create_shift(sender, nurse_type, shift, location, hospital_name, date, start_time, end_time);
              console.log("shift id created", shift_id);
          
              const nurses = await search_nurses(nurse_type, shift, location);
              console.log('Received:', sender, text);
          
              await send_nurses_message(nurses, nurse_type, shift, location, hospital_name, shift_id, sender, date, start_time, end_time);
            }
          }

        if (replyMessage.shift_details && replyMessage.cancellation){
            const shiftDetailsArray = Array.isArray(replyMessage.shift_details) ? replyMessage.shift_details : [replyMessage.shift_details];
            console.log("shift details", replyMessage.shift_details)
            for (const shiftDetail of shiftDetailsArray) {
              const { nurse_type, shift, location, hospital_name, date, start_time, end_time } = shiftDetail;
                await search_shift(nurse_type, shift, location, hospital_name, date, start_time, end_time, sender)
            }
        }

        if (replyMessage.shift_id && replyMessage.cancellation) {
            const shiftIDArray = Array.isArray(replyMessage.shift_id)
              ? replyMessage.shift_id
              : [replyMessage.shift_id];
          
            console.log("Shift IDs:", shiftIDArray);
          
            for (const shiftID of shiftIDArray) {
              const isValid = await validate_shift_before_cancellation(shiftID, sender);
          
              if (!isValid) continue;
          
              await search_shift_by_id(shiftID, sender);
            }
          }
          
        // if (replyMessage.ambiguous_shifts && replyMessage.cancellation && replyMessage.shift_details){
        //     const shiftDetailsArray = Array.isArray(replyMessage.ambiguous_shifts) ? replyMessage.ambiguous_shifts : [replyMessage.ambiguous_shifts];
        //     console.log("shift details", replyMessage.ambiguous_shifts)
        //     for (const shiftDetail of shiftDetailsArray) {
        //       const { nurse_type, shift, location, hospital_name, date, start_time, end_time, nurse_name } = shiftDetail;
        //         await match_shift(nurse_type, shift, location, hospital_name, date, start_time, end_time, sender, nurse_name)
        //     }
        // }
        await update_coordinator_chat_history(sender, replyMessage.message, "sent")
        
    } catch (error) {
        console.error('Error generating response:', error);
        res.status(500).json({ message: "Sorry, something went wrong." });
    }
});


module.exports = router;
