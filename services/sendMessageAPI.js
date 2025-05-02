const axios = require('axios');

const sendMessage = async (recipient, message) => {
    try {
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
