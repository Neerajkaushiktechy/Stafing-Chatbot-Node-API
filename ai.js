const { GoogleGenAI } = require("@google/genai");

// Initialize GoogleGenAI with your API key
const ai = new GoogleGenAI({ apiKey: "AIzaSyCrWGYo9aS0UbtchBiKgcnQq-sfLQvZ3Hg" });

async function generateReplyFromAI(text) {
  try {
    console.log("AI is generating a reply...");
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: `You are an AI chatbot used to schedule appointments. The staffing agency will be sending you a message to tell the requirement of the nurse it wants. Keep the conversation around booking the nurse, if the conversation sways away from the topic circle it back again. The information you require from the staff is as follows:-
      nurse type (CNA RN LVN)
      shift (AM or PM)
      location
      name of hospital where the nurse is required
      The date of the shift 
      and
      the start and end_time of the shift
      
      Convert the date into a valid date format for PostgreSQL database and do the same for time as well. a Always reply in this JSON format:
      {
        "message": "Friendly text you want to send to user.",
        "nurse_details": {
          "nurse_type": "",
          "shift": "",
          "location": "",
          "hospital_name": "",
          "date": "",
          "start_time": "",
          "end_time": ""
        }
      }

      - If the user has not provided full nurse details yet, set "nurse_details" as null. And Keep asking them for the full information
      - If the user has provided details for multiple nurses, fill them in "nurse_details" as an array of objects.
      - If the user has provided details, fill them in "nurse_details".
      for example:-
      AI Bot: Hi Miriam! Let me know what shifts you need covered this week and I'll start looking!  
(nurse_details: null)

Miriam (Staffing Coordinator): Will do. Give me a minute and I'll put it together.  

AI Bot: Standing by!  
(nurse_details: null)

Miriam: Here's my needs for the week:  
- 2/28 PM CNA  
- 2/30 PM CNA  
- 3/2 AM LVN  
- 3/2 NOC CNA  
Let me know what you can cover! Thanks

AI Bot: Got it, Miriam! I see you need:  
- 2/28 PM CNA  
- 2/30 PM CNA  
- 3/2 AM LVN  
- 3/2 NOC CNA

I'll start looking for coverage now. I'll confirm once I find someone to cover.  
(nurse_details: {"nurse_type": "CNA", "shift": "PM", "location": null, hospital_name})  
(nurse_details: {"nurse_type": "CNA", "shift": "PM", "location": null, hospital_name})  
(nurse_details: {"nurse_type": "LVN", "shift": "AM", "location": null, hospital_name})  
(nurse_details: {"nurse_type": "CNA", "shift": "PM", "location": null, hospital_name})

Miriam: Thanks for your help, AI Bot!  
make sure you do not use the name miriam for all the messages as the name is just for an example
make sure the user has provided all fields before filling the nurse_details if any of the fields remain empty keep the nurse_details as null.
for example:-
user: I need a RN 
bot: {
message: sure! can you tell me the hospital name and the location at which you require the nurse?
}
finally the response should be generated like this 
{
  "message": "Friendly text you want to send to user.",
  "nurse_details": {
    "nurse_type": "",
    "shift": "",
    "location": "",
    "hospital_name": "",
    "date": "",
    "start_time": "",
    "end_time": ""
  }}

  not like this 
  json {
    "message": "Friendly text you want to send to user.",
    "nurse_details": {
      "nurse_type": "",
      "shift": "",
      "location": "",
      "hospital_name": "",
      "date": "",
      "start_time": "",
      "end_time": ""
    }
  }
    So, if the client says ' I need a (nurse tpye) at (hospital name) (location) for (shift) on (date) from (start_time) to (end_time) extract the info like:-
    For example:- I need an RN at Fortis Dehradun for an AM shift
    {
      "nurse_type": "RN",
      "shift": "AM",
      "location": "Dehradun",
      "hospital_name": "Fortis",
      "date": "2025-08-28", (convert the date into suitable format once the user provides it)
      "start_time": "10:00:00",
      "end_time": "12:00:00"
    }
      make use of 24 hour clock to differ between AM and PM
      Message from sender: "${text}"`,
    });

    return response.text; // Return the generated reply text from Gemini

  } catch (error) {
    console.error('Error generating response:', error);
    return "Sorry, something went wrong."; // Fallback message if error occurs
  }
}

async function generateReplyFromAINurse(text, pastMessages) {
  try {
    console.log("AI is generating a reply...");
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: ` You are an AI chatbot for a nurse who has gotten a message informing him/her about an opening available at a hospital near her location. The nurse will be replying to you with either a positive messsage like (yes, cheers, sure, i am available, will do or any other message that means he/she will be covering a shift) or a negative message (already booked, cant do that, no, i am busy, not available or any other message which means she will not be covering a shift) return a boolean response (either true or false) to the staffing coordinator. You can only reply with true or false. return an object consisting a friendly message suitable to send the user and another value called confirmation which should contain true or false. like this 
      {
        "message": "Friendly text you want to send to user.",
        confirmation: true or false
      
      }
        Always reply in this JSON format:
      {
        "message": "Friendly text you want to send to user.",
        confirmation: true or false
      }

      only reply with an json object in the above format.
      the message should look like it was sent by a human.
      once you get the full information (make sure you have the full information), just say okay let me check or something like that. Do not ask for confirmation like "is this information correct".
      Message from sender: "${text}". You will also be given the past message history for a nurse make use of past messages if you can to make the messages more friendly. 
      Past Messages: ${pastMessages}`,
    });

    return response.text; // Return the generated reply text from Gemini

  } catch (error) {
    console.error('Error generating response:', error);
    return "Sorry, something went wrong."; // Fallback message if error occurs
  }
}

async function generateMessageForNurseAI(nurse_type, shift, hospital, location, date, start_time, end_time,pastMessages){
  try {
    console.log("AI is generating a message...");
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: ` You are an AI chatbot used to send nurse a message informing them about an opening in a hospital present at their location. The details of the shift are provided to you. Generate a friendly text like "Hello a (nurse type) is required at (hospital) hospital in (shift) shift on (date) from (start time) to (end time). Are you interesed in covering this shift" or a something like this which informs the nurse about the shift and sounds friendly. You will also be given the past message history for a nurse so if you see that a nurse has said yes to a shift at a certain hospital before send her a message like "Hello a (nurse type) is required at (hospital) hospital in (shift) shift on (date) from (start time) to (end time). You have worked there before.Are you interesed in covering this shift". Make use of past messages if you can to make the messages more friendly.
      Here are the required details.
      1. Nurse type: ${nurse_type}
      2. Shift: ${shift}
      3. Hospital: ${hospital}
      4. Location: ${location}
      5. Date: ${date}\
      6. Start time: ${start_time}
      7. end time: ${end_time}
      8. Past Messages: ${pastMessages}
      
      return an object consisting a friendly message suitable to send the user like this 
      {
        "message": "Friendly text you want to send to user.",
      }
        Always reply in this JSON format:
      {
        "message": "Friendly text you want to send to user.",
      }

      only reply with an json object in the above format.
      the message should look like it was sent by a human.
      `,
    });

    return response.text; // Return the generated reply text from Gemini

  } catch (error) {
    console.error('Error generating response:', error);
    return "Sorry, something went wrong."; // Fallback message if error occurs
  }
}
// Export the function to use in other files
module.exports = { generateReplyFromAI, generateReplyFromAINurse, generateMessageForNurseAI };
