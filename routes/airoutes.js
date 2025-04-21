const express = require('express');
const { generateReplyFromAI } = require('../ai.js');
const router = express.Router();
const { search_nurses, send_nurses_message } = require('../controller/nurse_controller.js');
const { create_shift } = require('../controller/shift_controller.js');
router.post('/chat', async (req, res) => {
    const { sender, text } = req.body; 

    console.log('Received:', sender, text);

    try {
        let replyMessage = await generateReplyFromAI(text);
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
        // if (replyMessage.nurse_details) {
        //     const { nurse_type, shift, location, hospital_name, date, start_time, end_time} = replyMessage.nurse_details;
        //     const nurse = { nurse_type, shift, location, hospital_name,date, start_time, end_time};
        //     console.log('Nurse details:', nurse);
        //     const shift_id = await create_shift(sender, nurse_type, shift, location, hospital_name, date, start_time, end_time);
        //     const nurses = await search_nurses(nurse_type, shift, location,);
        //     console.log('Received:', sender, text);
        //     console.log("shift id created",shift_id);
        //     await send_nurses_message(nurses, nurse_type, shift, location,hospital_name,shift_id,sender, date, start_time, end_time);
        // }
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
          
        res.json({ message: replyMessage.message });
    } catch (error) {
        console.error('Error generating response:', error);
        res.status(500).json({ message: "Sorry, something went wrong." });
    }
});


module.exports = router;
