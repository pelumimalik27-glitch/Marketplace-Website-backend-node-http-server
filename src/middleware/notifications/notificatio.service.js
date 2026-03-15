const sendEmail = require("../../utils/email");

const sendBuyerWelcome = async (email) => {

  await sendEmail(

    email,

    "Welcome",

    "Your account was successfully created"

  );

};


const sendSellerDashboardAlert = async (email) => {

  await sendEmail(

    email,

    "Seller Login",

    "You logged into your seller dashboard"

  );

};


module.exports = {

  sendBuyerWelcome,
  sendSellerDashboardAlert,

};