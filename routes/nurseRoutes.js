const express = require('express');
const { generateReplyFromAINurse } = require('../helper/promptHelper.js');
const router = express.Router();
const {update_coordinator} = require('../controller/coordinator_controller.js');
const { check_shift_status, search_shift, shift_cancellation_nurse, check_shift_validity} = require('../controller/shift_controller.js');
const { update_nurse_chat_history, get_nurse_chat_data } = require('../controller/nurse_controller.js');
const { sendMessage } = require('../services/sendMessageAPI.js');
require('dotenv').config();

router.post('/chat_nurse', async (req, res) => {
    const { sender, text } = req.body; 
    try {
        await update_nurse_chat_history(sender,text, "received")
    } catch (error) {
        console.error('Error updating chat history:', error);
    }

    try { 
        const pastMessages = await get_nurse_chat_data(sender)
        let replyMessage = await generateReplyFromAINurse(text,pastMessages);
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
        await update_nurse_chat_history(sender,replyMessage.message, "sent")
        res.json({ message: replyMessage.message});
        if (replyMessage.confirmation==true && replyMessage.shift_id) {
            const shift_id = replyMessage.shift_id
            const shiftIDArray = Array.isArray(replyMessage.shift_id) ? replyMessage.shift_id : [replyMessage.shift_id];
            for (const shiftID of shiftIDArray) {
                const valid_shift = await check_shift_validity(shiftID, sender);
                if (!valid_shift) continue;
              
                const status = await check_shift_status(shiftID, sender);
                if (status === 'filled') {
                    const message = 'Sorry, the shift has already been filled. We will update you when more shifts are available for you.';
                    await sendMessage(sender,message)
                  continue;
                }
                await update_coordinator(shiftID, sender);
              }
              
        }
        if (replyMessage.shift_details && replyMessage.cancellation){
            const shiftDetailsArray = Array.isArray(replyMessage.shift_details) ? replyMessage.shift_details : [replyMessage.shift_details];
            for (const shiftDetail of shiftDetailsArray) {
              const { nurse_type, shift,date} = shiftDetail;
              await shift_cancellation_nurse(nurse_type, shift,date,sender)
            }
        }
        
    } catch (error) {
        console.error('Error generating response:', error);
        res.status(500).json({ message: "Sorry, something went wrong." });
    }
});


module.exports = router;
