export const helmetConfig = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'", // Needed for inline scripts
        "https://cdn.jsdelivr.net", // Allow Scalar scripts
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'", // Scalar injects inline styles too
        "https://cdn.jsdelivr.net",
      ],
      imgSrc: ["'self'", "data:", "https://cdn.jsdelivr.net"],
      connectSrc: ["'self'", "https://cdn.jsdelivr.net"],
    },
  },
};
