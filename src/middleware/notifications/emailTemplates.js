const buyerWelcome = (name) => `

<h2>Welcome to Elite Marketplace 🎉</h2>

<p>Hello ${name},</p>

<p>
Thank you for joining Elite Marketplace.
You can now browse and buy products from trusted sellers.
</p>

<p>
We are excited to have you.
</p>

`;

const sellerWelcome = (name) => `

<h2>Welcome Seller 🎉</h2>

<p>Hello ${name},</p>

<p>
Your seller account has been verified.
You can now sell products on Elite Marketplace.
</p>

`;

module.exports = {
  buyerWelcome,
  sellerWelcome,
};