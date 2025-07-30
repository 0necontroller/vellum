import fs from 'fs'
import path from 'path'
import { Logger } from 'borgen'
import { ENV } from '../lib/environments'
import swaggerJSDoc from 'swagger-jsdoc'

const isProduction = process.env.NODE_ENV === 'production'
export const apiDocsServer = isProduction
  ? `https://vellum.zenetralabs.com`
  : `http://localhost:${ENV.SERVER_PORT}`

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Vellum API',
    version: 'v1.0.0',
    description: `This is the API documentation for Vellum`,
    license: {
      name: 'Copyright 2025 Vellum',
    },
  },
  servers: [
    {
      url: apiDocsServer,
    },
  ],
}

const generateOpenAPISpec = () => {
  const swaggerSpec = swaggerJSDoc({
    failOnErrors: true,
    definition: swaggerDefinition,
    apis: [path.join(__dirname, '../controllers/**/*Controller.ts')],
  })

  fs.writeFileSync(
    path.join(__dirname, 'openapi.json'),
    JSON.stringify(swaggerSpec, null, 2),
    'utf-8',
  )

  Logger.info({ message: 'Swagger spec generated successfully' })
}

export default generateOpenAPISpec
