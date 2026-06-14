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
    description: "Get details for a specific OpenArt character by name (the current UI exposes no numeric ID).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Character name" } },
      required: ["id"],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "openart_create_character",
    description:
      "Create a new OpenArt character from a front-facing image. Provide name, local image path, optional background story. (voice_id is ignored — the current UI uses an audio upload/library picker.)",
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
    description:
      "Generate a video from a text prompt via OpenArt's Text-to-Video tool (Seedance). Good for product ads: describe the scene/action in `script`. Optionally attach ONE visual reference (precedence: byteplus_character > image_path > character_id). For people, prefer `byteplus_character` — OpenArt warns user-uploaded faces cause generation failures. Spends credits (~400 tokens); renders async — poll openart_get_video_status with the returned id.",
    inputSchema: {
      type: "object",
      properties: {
        script: {
          type: "string",
          description: "Video prompt — describe the scene/action (e.g. the product ad concept).",
        },
        byteplus_character: {
          type: "string",
          enum: ["Model", "Singer", "DJ/Music Producer", "Clerk/Administrative Staff", "Retiree"],
          description:
            "Recommended way to include a person in the video: select a BytePlus library character. The terms 'character', 'model', 'person', 'spokesperson', 'avatar', and 'actor' are interchangeable — all map to this. Map role hints to the closest value (singer→Singer, DJ/producer→DJ/Music Producer, clerk/office→Clerk/Administrative Staff, older/retiree→Retiree); otherwise default to Model.",
        },
        image_path: {
          type: "string",
          description: "Optional: absolute local path to a reference image (e.g. a product photo).",
        },
        character_id: {
          type: "string",
          description: "Optional: existing user character name (discouraged for this model — may fail).",
        },
        aspect_ratio: { type: "string", enum: ["9:16", "16:9", "1:1", "4:3", "3:4", "21:9"] },
      },
      required: ["script"],
    },
    annotations: { destructiveHint: false, openWorldHint: true },
  },
  {
    name: "openart_get_video_status",
    description: "Check the render status (queued/rendering/complete/failed) and URL of a video by the id returned from openart_generate_video.",
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
            script: z.string(),
            byteplus_character: z.string().optional(),
            image_path: z.string().optional(),
            character_id: z.string().optional(),
            aspect_ratio: z.enum(["9:16", "16:9", "1:1", "4:3", "3:4", "21:9"]).optional(),
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
