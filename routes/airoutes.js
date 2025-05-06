const express = require('express');
const { generateReplyFromAI } = require('../helper/promptHelper.js');
const router = express.Router();
const { search_nurses, send_nurses_message } = require('../controller/nurse_controller.js');
const { create_shift, search_shift, search_shift_by_id} = require('../controller/shift_controller.js');
const { update_coordinator_chat_history, get_coordinator_chat_data, validate_shift_before_cancellation } = require('../controller/coordinator_controller.js');
router.post('/chat', async (req, res) => {
    const { sender, text } = req.body; 

    await update_coordinator_chat_history(sender,text, "received")
    const pastMessages = await get_coordinator_chat_data(sender)
    try {
        let replyMessage = await generateReplyFromAI(text,pastMessages);

        // Check if replyMessage is a string and starts with ```json
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
        console.log('reply from ai', replyMessage)
        res.json({ message: replyMessage.message });
        if (replyMessage.nurse_details) {
            const nurseDetailsArray = Array.isArray(replyMessage.nurse_details) ? replyMessage.nurse_details : [replyMessage.nurse_details];
          
            for (const nurseDetail of nurseDetailsArray) {
              const { nurse_type, shift, date } = nurseDetail;
          
              const shift_id = await create_shift(sender, nurse_type, shift, date);
          
              const nurses = await search_nurses(nurse_type, shift, shift_id);
              console.log('nurses', nurses)
              await send_nurses_message(nurses, nurse_type, shift, shift_id, date);
            }
          }

        if (replyMessage.shift_details && replyMessage.cancellation){
            const shiftDetailsArray = Array.isArray(replyMessage.shift_details) ? replyMessage.shift_details : [replyMessage.shift_details];
            for (const shiftDetail of shiftDetailsArray) {
              const { nurse_type, shift, date } = shiftDetail;
                await search_shift(nurse_type, shift, date, sender)
            }
        }

        if (replyMessage.shift_id && replyMessage.cancellation) {
            const shiftIDArray = Array.isArray(replyMessage.shift_id)
              ? replyMessage.shift_id
              : [replyMessage.shift_id];
          
          
            for (const shiftID of shiftIDArray) {
              const isValid = await validate_shift_before_cancellation(shiftID, sender);
          
              if (!isValid) continue;
          
              await search_shift_by_id(shiftID, sender);
            }
        }
          

        await update_coordinator_chat_history(sender, replyMessage.message, "sent")
        
    } catch (error) {
        console.error('Error generating response:', error);
        res.status(500).json({ message: "Sorry, something went wrong." });
    }
});


module.exports = router;
