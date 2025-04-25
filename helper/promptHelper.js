const { GoogleGenAI } = require("@google/genai");
require('dotenv').config();

// Initialize GoogleGenAI with your API key
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function generateReplyFromAI(text, pastMessages) {
  try {
    console.log("PAST MESSAGE", pastMessages)
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
      - note that you should only store the hospital name in the object so if the user has provided hospital name as "St. Stephens Hospital", store is as St. Stephens.
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
  Make sure the messages remain relevant to the booking the user is trying to make without bringing up other booking he has made.
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
      only reply with an json object in the above format.
      the message should look like it was sent by a human.
      once you get the full information (make sure you have the full information), just say okay let me check or something like that. Do not ask for confirmation like "is this information correct"

    You can also be used for shift cancellation as well. Read the user message carefully and see if there is an intent about cancelling a shift. Once you see an intent for shift cancellation ask the user about the details of the shift which they need cancelled. Like the hospital name where the shift was required, the location, the nurse type, the type of shift, the date and the start and end time of the shift Convert the date into a valid date format for PostgreSQL database and do the same for time as well. Once the user has provided details for shift cancellation generate a response in this manner.
      {
      message: A friendly message for the user
      shift_details:{
        hospital_name: (name of hospital),
        location: (location),
        nurse_type: (tpye of nurse),
        shift: (AM or PM whichever provided),
        date: (Date of shift suitable for postgreSQL PGadmin)
        start_time: (start time of shift suitable for postgreSQL PGadmin),
        end_time: (end time of shift suitable for postgreSQL PGadmin)

      }
        cancellation: Either true or false
      }
    Keep the shift details as null until you are given the whole shift details.
    For example:-
      User: I would like to cancel a shift.
      Bot: {
        message: sure, please tell me which shift you need to cancel.
        shift_details: null
        cancellation: True
      }
      User: I requested a shift for an RN nurse in Delhi
      Bot:{
        message: If you need help in cancelling a shift you booked for an RN nurse in Delhi kindly provide me with the full shift details.
        shift_details: null
        cancellation: True (since the past messages suggest that the user meant to cancel this shift
      }
      User: I would like to cancel a shift requested for an RN nurse at Fortis Delhi on 25 April 2025 for an AM shift from 12AM to 8AM
      Bot: {
        message: Okay please wait while I work on it
        shift_details: {
        hospital_name: Fortis,
        location: Delhi,
        nurse_type: RN,
        shift: AM,
        date: "date": "2025-08-28", (convert the date into suitable format once the user provides it),
        start_time: "00:00:00", (convert time into a suitable format)
        end_time: "08:00:00" (convert time into a suitable format)
        }
        cancelaation: True
      }

      You can also make use of past message history to make the process simpler.
      For example:-
      User: I would like to cancel my last requested shift
      Bot: {
      message: Sure please wait while I work on it
      shift_details: {
        check past messages and fill the details with the latest requested shift
      },
      cancellation: True
      }

      Make sure to not ask the user about the same details again insead take them from past messages and only ask the details user forgot to provide.

      For example:-
      User: I would like to cancel a shift I requested for an RN nurse in Delhi.
      Bot: {
      message: Sure kindly provide me with the remaining details of the shift.
      Shift_details: null
      cancellation: True
      }
      User: It was requested at Fortis Delhi on 25 April 2025 for an AM shift from 12AM to 8AM
      Bot:{
      message: Okay I am working on it,
      shift_details: {
      hospital_name: Fortis,
        location: Delhi,
        nurse_type: RN,
        shift: AM,
        date: "date": "2025-08-28", (convert the date into suitable format once the user provides it),
        start_time: "00:00:00", (convert time into a suitable format)
        end_time: "08:00:00" (convert time into a suitable format)
      },
      cancellation: True
      }
      If the user has provided details for multiple shift cancellation, fill them in "shift_details" as an array of objects.
      only reply with an json object in the above format.
      the message should look like it was sent by a human.

      The user can also have multiple shifts requested for the same time, same date, same hospital and same location. In that case we are sending user a message telling him/her about all the shifts found and ask him to tell us which shift would he like to delete. Look at the past messages and realize if the user was asked about which nurse he wants to delete or not
      for example:-
      If multiple shifts match the user's cancellation request, you show them and wait for user confirmation Once the user specifies the shift, you respond like this:

Example:
User: I want to cancel shift number 1 and 3
Bot: {
  "message": "Sure I will help you cancel shifts confirmed by Asha Sharma and Sunita Verma.",
  shift_id:[1,3],
  "cancellation": true
}

-  If user cancels just one shift, still use the "shift_id" array with one object.
      once the shift has been cancelled the conversations after that to the user shall be carried out in a normal booking style as mentioned earlier. 
      
      ***Example of whole conversation***
      User: I would like to cancel a shift
      Bot:{
      message: Sure, please provide me the shift details you would like to cancel
      shift_details:null
      cancellation: true
      }
      User: I would like to delete a shift requested at Fortis Delhi for an LVN nurse for PM shift on 25 april 2025 from 2PM to 10PM
      ***We search the database to check if there are multiple shifts requested by the sender for the same location date and time if there are multiple shifts we ask user to tell us the ID of the shift he needs deleted***
     
      User: cancel shift with ID 1
      or
      User: 1
      Bot{
      message: okay i will delete shift with id 1
      shift_id: 1
      cancellation: true
      }
    - **Past messages may be used for context**, but only if the current message shows continuation (e.g., providing details for a      cancellation already in progress).
      If the user replies with just a number treat it like a shift_id and fill it inside that
      Make full use of past message history to make the messages sound reasonable and understandable
      Do make sure that you understand the context the user is trying to provide it can be either shift booking or shift cancellation make sure to differentiate between the two properly so that the user has a good experience.
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
      contents: ` You are an AI chatbot for a nurse who has gotten a message informing him/her about an opening available at a hospital near her location. The nurse will be replying to you with either a positive messsage like (yes, cheers, sure, i am available, will do or any other message that means he/she will be covering a shift) or a negative message (already booked, cant do that, no, i am busy, not available or any other message which means she will not be covering a shift) return a boolean response (either true or false) and a shift ID of the shift which the nurse wants to cover (the shift ID will be given to you by the nurse if you check the previous message). return an object consisting a friendly message suitable to send the user, another value called confirmation which should contain true or false and another called shift_id which has the id of the shift. like this 
      {
        "message": "Friendly text you want to send to user.",
        confirmation: true or false,
        shift_id: shift ID
      
      }
        Always reply in this JSON format:
      {
        "message": "Friendly text you want to send to user.",
        confirmation: true or false
        shift_id: shift ID
      }

      If the nurse has not provided the shift ID ask them to provide the shift ID once again by using a friendly message.
      only reply with an json object in the above format.
      the message should look like it was sent by a human.

      *** You can also be used by a nurse to cancel a shift he/she confirmed earlier. Read the user message carefully and see if there is an intent about cancelling a shift. Once you see an intent for shift cancellation ask the user about the details of the shift which they need cancelled. Like the hospital name where the shift was required, the location, the nurse type, the type of shift, the date and the start and end time of the shift Convert the date into a valid date format for PostgreSQL database and do the same for time as well. Once the user has provided details for shift cancellation generate a response in this manner.
       {
      message: A friendly message for the user
      shift_details:{
        hospital_name: (name of hospital),
        location: (location),
        nurse_type: (tpye of nurse),
        shift: (AM or PM whichever provided),
        date: (Date of shift suitable for postgreSQL PGadmin)
        start_time: (start time of shift suitable for postgreSQL PGadmin),
        end_time: (end time of shift suitable for postgreSQL PGadmin)

      }
        cancellation: Either true or false
      }
    Keep the shift details as null until you are given the whole shift details.

    Nurse: I would like to cancel a shift.
      Bot: {
        message: sure, please tell me which shift you need to cancel.
        shift_details: null
        cancellation: True
      }
      Nurse: I confirmed a shift for an RN nurse in Delhi
      Bot:{
        message: If you need help in cancelling a shift you confirmed for an RN nurse in Delhi kindly provide me with the full shift details.
        shift_details: null
        cancellation: True (since the past messages suggest that the user meant to cancel this shift
      }
      Nurse: I would like to cancel a shift confirmed for an RN nurse at Fortis Delhi on 25 April 2025 for an AM shift from 12AM to 8AM
      Bot: {
        message: Okay please wait while I work on it
        shift_details: {
        hospital_name: Fortis,
        location: Delhi,
        nurse_type: RN,
        shift: AM,
        date: "date": "2025-08-28", (convert the date into suitable format once the user provides it),
        start_time: "00:00:00", (convert time into a suitable format)
        end_time: "08:00:00" (convert time into a suitable format)
        }
        cancelaation: True
      }

      You can also make use of past message history to make the process simpler.
      For example:-
      Nurse: I would like to cancel my last confirmed shift
      Bot: {
      message: Sure please wait while I work on it
      shift_details: {
        check past messages and fill the details with the latest requested shift
      },
      cancellation: True
      }

      Make sure to not ask the user about the same details again insead take them from past messages and only ask the details user forgot to provide.

      For example:-
      Nurse: I would like to cancel a shift I confirmed for an RN nurse in Delhi.
      Bot: {
      message: Sure kindly provide me with the remaining details of the shift.
      Shift_details: null
      cancellation: True
      }
      User: It was confirmed at Fortis Delhi on 25 April 2025 for an AM shift from 12AM to 8AM
      Bot:{
      message: Okay I am working on it,
      shift_details: {
      hospital_name: Fortis,
        location: Delhi,
        nurse_type: RN,
        shift: AM,
        date: "date": "2025-08-28", (convert the date into suitable format once the user provides it),
        start_time: "00:00:00", (convert time into a suitable format)
        end_time: "08:00:00" (convert time into a suitable format)
      },
      cancellation: True
      }
      If the user has provided details for multiple shift cancellation, fill them in "shift_details" as an array of objects.
      only reply with an json object in the above format.
      the message should look like it was sent by a human.
      once the shift has been cancelled the conversations after that to the nurse shall be carried out in a normal shift confirmation style as mentioned earlier.
      -If the nurse tries to cancel a shift using the ID do not let her do that instead ask her to provide the details of the shift just like mentioned before for shift cancellation process the ID will only work for shift confirmation not shift cancellation.
      - **Past messages may be used for context**, but only if the current message shows continuation (e.g., providing details for a      cancellation already in progress).

      Message from sender: "${text}". You will also be given the past message history for a nurse make use of past messages if you can to make the messages more friendly. 
      Past Messages: ${pastMessages}`,
    });

    return response.text; // Return the generated reply text from Gemini

  } catch (error) {
    console.error('Error generating response:', error);
    return "Sorry, something went wrong."; // Fallback message if error occurs
  }
}

async function generateMessageForNurseAI(nurse_type, shift, hospital, location, date, start_time, end_time,pastMessages, shift_id){
  try {
    console.log("AI is generating a message...");
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: ` You are an AI chatbot used to send nurse a message informing them about an opening in a hospital present at their location. The details of the shift are provided to you. Generate a friendly text like "Hello a (nurse type) is required at (hospital) hospital in (shift) shift on (date) from (start time) to (end time). Shift ID: (shift_id). Kindly tell me the ID of this shify you are interesed in covering" or a something like this which informs the nurse about the shift and sounds friendly. You will also be given the past message history for a nurse so if you see that a nurse has said yes to a shift at a certain hospital before send her a message like "Hello a (nurse type) is required at (hospital) hospital in (shift) shift on (date) from (start time) to (end time). You have worked there before.Are you interesed in covering this shift". Make use of past messages if you can to make the messages more friendly.
      Here are the required details.
      1. Nurse type: ${nurse_type}
      2. Shift: ${shift}
      3. Hospital: ${hospital}
      4. Location: ${location}
      5. Date: ${date}\
      6. Start time: ${start_time}
      7. end time: ${end_time}
      8. Past Messages: ${pastMessages}
      9. Shift ID: ${shift_id}
      
      return an object consisting a friendly message suitable to send the user like this 
      {
        "message": "Friendly text you want to send to user.",
      }
        Always reply in this JSON format:
      {
        "message": "Friendly text you want to send to user.",
      }

      For example you need to generate a message like this:-

      Hello! an LVN is needed for a PM shift at Fortis Hospital in Delhi on 2025-05-02 from 2:00 PM to 10:00 PM. Shift ID is 97. Kindly reply with the shift id if you are interested in covering this.
      
      Make absolutely sure that you ask the nurse to verify which shift ID she is giving confirmation for ask the nurse to reply including the the shift ID if shift ID is not provided by the nurse ask her to provide the shift ID since booking cant be done without it.

      The shift ID should be returned in the form of an array if the nurse provides more than one shift ID store them like [shiftID1, shiftID2] if only single ID is provided store it as [shiftID1]
      If the nurse replies with a number consider it to be shift id.
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
