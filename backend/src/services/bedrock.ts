// backend/src/services/bedrock.ts
/**
 * AWS Bedrock service for LLM and embeddings
 * All-in-one AWS solution - no external APIs needed!
 */
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

const REGION = process.env.BEDROCK_REGION || 'us-east-1';

// Bedrock client singleton
let bedrockClient: BedrockRuntimeClient | null = null;

function getBedrockClient(): BedrockRuntimeClient {
  if (!bedrockClient) {
    bedrockClient = new BedrockRuntimeClient({ region: REGION });
  }
  return bedrockClient;
}

// ============================================================================
// LLM Service (Claude 3.5 Sonnet)
// ============================================================================

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatResponse {
  content: string;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

export class BedrockLLMService {
  private client: BedrockRuntimeClient;
  private modelId: string;

  constructor() {
    this.client = getBedrockClient();
    this.modelId = process.env.BEDROCK_LLM_MODEL || 'anthropic.claude-3-5-sonnet-20241022-v2:0';
  }

  async chat(messages: Message[], maxTokens: number = 4096): Promise<ChatResponse> {
    try {
      const isNova = this.modelId.startsWith('amazon.nova');
      const isClaude = this.modelId.startsWith('anthropic.');

      let requestBody: any;
      let responseBody: any;

      if (isNova) {
        // Amazon Nova format
        const systemMessage = messages.find(m => m.role === 'system')?.content || '';
        const conversationMessages = messages
          .filter(m => m.role !== 'system')
          .map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: [{ text: m.content }],
          }));

        // Ensure first message is a user message (Bedrock requirement)
        if (conversationMessages.length > 0 && conversationMessages[0].role !== 'user') {
          console.warn('⚠️  First message is not user role, adjusting...');
          conversationMessages[0].role = 'user';
        }

        requestBody = {
          schemaVersion: 'messages-v1',
          messages: conversationMessages,
          system: systemMessage ? [{ text: systemMessage }] : undefined,
          inferenceConfig: {
            maxTokens: maxTokens,
            temperature: 0.7,
          },
        };

        const command = new InvokeModelCommand({
          modelId: this.modelId,
          body: JSON.stringify(requestBody),
          contentType: 'application/json',
          accept: 'application/json',
        });

        const response = await this.client.send(command);
        responseBody = JSON.parse(new TextDecoder().decode(response.body));

        return {
          content: responseBody.output.message.content[0].text,
          model: this.modelId,
          usage: {
            inputTokens: responseBody.usage.inputTokens,
            outputTokens: responseBody.usage.outputTokens,
            totalTokens: responseBody.usage.inputTokens + responseBody.usage.outputTokens,
          },
        };
      } else if (isClaude) {
        // Claude format
        const systemMessage = messages.find(m => m.role === 'system')?.content || '';
        const conversationMessages = messages
          .filter(m => m.role !== 'system')
          .map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
          }));

        // Ensure first message is a user message (Bedrock requirement)
        if (conversationMessages.length > 0 && conversationMessages[0].role !== 'user') {
          console.warn('⚠️  First message is not user role, adjusting...');
          conversationMessages[0].role = 'user';
        }

        requestBody = {
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: maxTokens,
          system: systemMessage,
          messages: conversationMessages,
          temperature: 0.7,
        };

        const command = new InvokeModelCommand({
          modelId: this.modelId,
          body: JSON.stringify(requestBody),
          contentType: 'application/json',
          accept: 'application/json',
        });

        const response = await this.client.send(command);
        responseBody = JSON.parse(new TextDecoder().decode(response.body));

        return {
          content: responseBody.content[0].text,
          model: this.modelId,
          usage: {
            inputTokens: responseBody.usage.input_tokens,
            outputTokens: responseBody.usage.output_tokens,
            totalTokens: responseBody.usage.input_tokens + responseBody.usage.output_tokens,
          },
        };
      } else {
        throw new Error(`Unsupported model: ${this.modelId}`);
      }
    } catch (error: any) {
      // Check if error is due to content filtering
      const errorMessage = error.message || JSON.stringify(error);
      if (errorMessage.includes('content filter') || errorMessage.includes('blocked by our content filters')) {
        console.error('⚠️  Content filtered by Bedrock guardrails');
        return {
          content: 'I apologize, but I cannot provide that response due to content policy restrictions. Could you rephrase your request?',
          model: this.modelId,
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
          },
        };
      }
      console.error('Bedrock LLM error:', error);
      throw error;
    }
  }

  estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4);
  }
}

// ============================================================================
// Embeddings Service (Titan Embeddings V2)
// ============================================================================

export class BedrockEmbeddingsService {
  private client: BedrockRuntimeClient;
  private modelId: string;

  constructor() {
    this.client = getBedrockClient();
    this.modelId = process.env.BEDROCK_EMBED_MODEL || 'amazon.titan-embed-text-v2:0';
  }

  async embedText(text: string): Promise<number[]> {
    try {
      const requestBody = {
        inputText: text,
        dimensions: 1024, // Titan V2 supports 256, 512, 1024
        normalize: true,
      };

      const command = new InvokeModelCommand({
        modelId: this.modelId,
        body: JSON.stringify(requestBody),
        contentType: 'application/json',
        accept: 'application/json',
      });

      const response = await this.client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      return responseBody.embedding as number[];
    } catch (error) {
      console.error('Bedrock embedding error:', error);
      throw error;
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Titan doesn't have batch API, call individually
    const embeddings = await Promise.all(texts.map(text => this.embedText(text)));
    return embeddings;
  }

  async embedQuery(query: string): Promise<number[]> {
    return this.embedText(query);
  }
}

// ============================================================================
// Singleton Exports
// ============================================================================

let llmInstance: BedrockLLMService | null = null;
let embeddingsInstance: BedrockEmbeddingsService | null = null;

export function getLLMService(): BedrockLLMService {
  if (!llmInstance) {
    llmInstance = new BedrockLLMService();
  }
  return llmInstance;
}

export function getEmbeddingsService(): BedrockEmbeddingsService {
  if (!embeddingsInstance) {
    embeddingsInstance = new BedrockEmbeddingsService();
  }
  return embeddingsInstance;
}

