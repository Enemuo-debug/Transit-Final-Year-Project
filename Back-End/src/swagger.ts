import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Transit",
      version: "1.0.0",
      description: "API documentation for the Final Year Project backend",
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT ?? 3000}`,
        description: "Local server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  },
  apis: ["./src/routes/*.routes.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
