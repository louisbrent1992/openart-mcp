#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  listCharacters,
  getCharacter,
  createCharacter,
  generateVideo,
  getVideoStatus,
  cleanup,
} from "./tools.js";

const server = new Server(
  { name: "openart-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

const tools = [
  {
    name: "openart_list_characters",
    description: "List all characters/avatars in the user's OpenArt account.",
    inputSchema: { type: "object", properties: {}, required: [] },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "openart_get_character",
    description: "Get details for a specific OpenArt character by ID.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Character ID" } },
      required: ["id"],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "openart_create_character",
    description:
      "Create a new OpenArt character from an image. Provide name, local image path, optional background story, optional voice ID.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        image_path: { type: "string", description: "Absolute local file path to the character image" },
        background_story: { type: "string" },
        voice_id: { type: "string" },
      },
      required: ["name", "image_path"],
    },
    annotations: { destructiveHint: false, openWorldHint: true },
  },
  {
    name: "openart_generate_video",
    description: "Generate a video using an existing OpenArt character speaking a script.",
    inputSchema: {
      type: "object",
      properties: {
        character_id: { type: "string" },
        script: { type: "string", description: "What the character says" },
        aspect_ratio: { type: "string", enum: ["9:16", "16:9", "1:1"] },
      },
      required: ["character_id", "script"],
    },
    annotations: { destructiveHint: false, openWorldHint: true },
  },
  {
    name: "openart_get_video_status",
    description: "Check the rendering status and URL of an OpenArt video by ID.",
    inputSchema: {
      type: "object",
      properties: { video_id: { type: "string" } },
      required: ["video_id"],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  try {
    let result: unknown;
    switch (name) {
      case "openart_list_characters":
        result = await listCharacters();
        break;
      case "openart_get_character":
        result = await getCharacter(z.object({ id: z.string() }).parse(args).id);
        break;
      case "openart_create_character":
        result = await createCharacter(
          z.object({
            name: z.string(),
            image_path: z.string(),
            background_story: z.string().optional(),
            voice_id: z.string().optional(),
          }).parse(args)
        );
        break;
      case "openart_generate_video":
        result = await generateVideo(
          z.object({
            character_id: z.string(),
            script: z.string(),
            aspect_ratio: z.enum(["9:16", "16:9", "1:1"]).optional(),
          }).parse(args)
        );
        break;
      case "openart_get_video_status":
        result = await getVideoStatus(z.object({ video_id: z.string() }).parse(args).video_id);
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    const text = JSON.stringify(result, null, 2);
    return {
      content: [{ type: "text", text }],
      structuredContent: result as Record<string, unknown>,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

process.on("SIGINT", async () => {
  await cleanup();
  process.exit(0);
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("openart-mcp listening on stdio");
