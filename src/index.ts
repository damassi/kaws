import "dotenv/config"
import "reflect-metadata"

import ddTracer from "dd-trace"
import { GraphQLServer, Options } from "graphql-yoga"
import { parse } from "mongodb-uri"
import * as morgan from "morgan"
import { Connection, createConnection } from "typeorm"

import { createSchema } from "./createSchema"
import { entities } from "./Entities"

const { MONGOHQ_URL, NODE_ENV, PORT } = process.env

async function bootstrap() {
  try {
    const schema = await createSchema()
    const server = new GraphQLServer({ schema })
    const app = server.express

    // Setup DataDog
    if (process.env.DD_APM_ENABLED) {
      ddTracer.init({
        hostname: process.env.DD_TRACE_AGENT_HOSTNAME,
        service: "kaws",
        plugins: false,
      })
      ddTracer.use("express", {
        service: "kaws",
        headers: ["User-Agent"],
      })
      ddTracer.use("graphql", {
        service: "kaws.graphql",
      })
      ddTracer.use("http", {
        service: `kaws.http-client`,
      })
    }

    const { username, password, database, hosts, options } = parse(MONGOHQ_URL!)

    const connection: Connection = await createConnection({
      type: "mongodb",
      username,
      password,
      database,
      ...options,
      host: hosts.map(a => a.host).join(","),
      port: 27017,
      ssl: true,
      entities,
    })
    if (connection.isConnected) {
      // tslint:disable-next-line
      console.log(
        "[kaws] Successfully connected to MongoDB database:",
        database
      )
    }

    const serverOptions: Options = {
      port: PORT,
      endpoint: "/graphql",
      playground: "/playground",
      debug: NODE_ENV === "development",
    }

    app.get("/health", (req, res) => res.status(200).end())
    app.use(morgan("combined"))

    server.start(serverOptions, ({ port, playground }) => {
      // tslint:disable-next-line
      console.log(
        `[kaws] Server is running, GraphQL Playground available at http://localhost:${port}${playground}`
      )
    })
  } catch (error) {
    // tslint:disable-next-line
    console.error("[kaws] Failed to connect to MongoDB ", error)
  }
}

bootstrap()
