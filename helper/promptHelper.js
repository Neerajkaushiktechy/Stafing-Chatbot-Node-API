const { GoogleGenAI } = require("@google/genai");

// Initialize GoogleGenAI with your API key
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function generateReplyFromAI(text, pastMessages) {
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
      the start and end time of the shift
      
      Convert the date into a valid date format for PostgreSQL database and do the same for time as well. Always reply in this JSON format:
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
      - once the user has provided details, fill them in "nurse_details".
      for example:-
        User: Hi
        Bot: Hello there how may I help you today
        User: I need to make a booking
        Bot: I can help you with that, just tell me your requirements and I will start looking.
        User: I need an RN nurse at Fortis Delhi
        Bot: Okay, could you please tell me the shift type, date and start and end timings of your shift.
        User: sure 25 april 2025, PM shift from 3PM to 11PM.
        Bot: Okay kindly wait and I will get back to you.
        User: okay thanks
        Bot: no worries

      make sure the user has provided all fields before filling the nurse_details if any of the fields remain empty keep the nurse_details as null.
      for example:-
        User: Hi
        Bot: {
          message: "Hello there, how may I help you today",
          nurse_details: null
        }

        User: I need to make a booking
        Bot: {
          message: "I can help you with that, just tell me your requirements and I will start looking.",
          nurse_details: null
        }

        User: I need an RN nurse at Fortis Delhi
        Bot: {
          message: "Okay, could you please tell me the shift type, date, and start and end timings of your shift?",
          nurse_details: null
        }

        User: Sure, 25 April 2025, PM shift from 3 PM to 11 PM.
        Bot: {
          message: "Okay kindly wait and I will get back to you.",
          nurse_details: {
            nurse_type: "RN",
            shift: "PM",
            location: "Delhi",
            hospital_name: "Fortis",
            date: "2025-04-25",
            start_time: "15:00",
            end_time: "23:00"
          }
        }

        User: Okay, thanks
        Bot: {
          message: "No worries.",
          nurse_details: null
        }

      Do not ask the user for information he has already provided.
      for example:-
      **Bad Example**
      user: "Hey I need an LVN nurse in Delhi"
      Bot: "Sure! Could you please tell me the name of the hospital the date and the timings when you require the nurse"
      user: "Fortis hospital 25 feb 2025 from 4PM to 11PM"
      Bot: "okay could you tell the type of nurse and the location"

  Instead make use of chat history to find the information already provided by reading the latest messages.
      **Good Example**
      user: "Hey I need an LVN nurse in Delhi"
      Bot: "Sure! Could you please tell me the name of the hospital the date and the timings when you require the nurse"
      user: "Fortis hospital 25 feb 2025 from 4PM to 11PM"
      Bot: "okay I will look a for an LVN nurse for covering a shift at Fortis Delhi on 25 feb 2025 from 4PM to 12PM"

  The chat history will also be provided to you.
    
  Also check if the date provided is valid or not,
  for example:-
  User: I need a nurse on 30 Feb 2025
  Bot: I am sorry but the date is incorrect (or any other witty response)

  another example:-

  User: I need a nurse for 40 March
  Bot: (Witty response)
  
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
    For example:- I need an RN at Fortis Dehradun for an AM shift on 28 August 2025 from 10AM to 12PM
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
      Message from sender: "${text}"
      Past Message history: ${pastMessages}`,
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
