const axios = require('axios');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const sendMessage = async (recipient, message) => {
    try {
        await sleep(5000);
        const response = await axios.post(`${process.env.HOST_MAC}/send_message/`, {
            recipient,
            message,
        });
        return response.data;
    } catch (error) {
        console.error(`Failed to send message to ${recipient}:`, error.response ? error.response.data : error.message);
    }
};

module.exports = {
    sendMessage,
};
