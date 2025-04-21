const express = require('express');
const pool = require('../db');
const { generateReplyFromAINurse } = require('../ai.js');
const router = express.Router();
const {update_coordinator} = require('../controller/coordinator_controller.js');
const { check_shift_status } = require('../controller/shift_controller.js');
const axios = require('axios');

router.post('/chat_nurse', async (req, res) => {
    const { sender, text } = req.body; 

    console.log('Received:', sender, text);

    try {
        const { rows } = await pool.query(
            `SELECT shift_id 
             FROM chat_history  
             WHERE receiver = $1 
               AND shift_id IS NOT NULL 
             ORDER BY created_at DESC 
             LIMIT 1`,
            [sender]
        );
        

        const shift_id = rows.length > 0 ? rows[0].shift_id : null;

        console.log("Found shift_id:", shift_id);
        
        let replyMessage = await generateReplyFromAINurse(text);
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
        if (replyMessage.confirmation==true) {
            const status = await check_shift_status(shift_id)
            if (status == 'filled'){
                try {
                    const message = 'Sorry the shift has already been filled, we will update you when more shifts are available for you'
                      const response = await axios.post(`${process.env.HOST_MAC}/send_message/`, {
                        recipient: sender,
                        message: message,
                      });
                      console.log(`Message sent to ${sender}`);
                    } catch (error) {
                      console.error(`Failed to send message to ${sender}:`, error.response ? error.response.data : error.message);
                    } 
            }
            else{
                await update_coordinator(shift_id, sender)
            }
        }
        res.json({ message: replyMessage.message});
    } catch (error) {
        console.error('Error generating response:', error);
        res.status(500).json({ message: "Sorry, something went wrong." });
    }
});


module.exports = router;
