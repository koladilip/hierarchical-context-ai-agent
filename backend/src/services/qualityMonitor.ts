// backend/src/services/qualityMonitor.ts
/**
 * Quality Monitor - Measures context management quality
 * 
 * Implements:
 * 1. Entity drift tracking
 * 2. Context retention metrics
 * 3. LLM self-evaluation
 * 4. Quality scoring
 */
import { getLLMService } from './bedrock';
import { ConversationTurn, StructuredMemory } from './contextManager';

// Quality metrics
export interface QualityMetrics {
  entityDrift: number;           // 0-1, lower is better
  contextRetention: number;      // 0-1, higher is better
  factPreservation: number;      // 0-1, higher is better
  selfEvaluationScore: number;   // 0-1, higher is better
  overallScore: number;          // 0-1, weighted average
  timestamp: string;
}

export interface EntityDriftReport {
  entitiesIntroduced: number;
  entitiesPreserved: number;
  entitiesLost: number;
  entitiesDistorted: number;
  driftScore: number;
}

export interface ContextRetentionReport {
  factsIntroduced: number;
  factsRecalled: number;
  retentionScore: number;
  keyFacts: string[];
}

export class QualityMonitor {
  private baselineEntities: Set<string> = new Set();
  private baselineFacts: Set<string> = new Set();
  private conversationGoals: string[] = [];
  private metricsHistory: QualityMetrics[] = [];

  /**
   * Track entities introduced in conversation
   */
  trackEntities(entities: Record<string, string[]>): void {
    for (const category of Object.values(entities)) {
      category.forEach(entity => this.baselineEntities.add(entity.toLowerCase()));
    }
  }

  /**
   * Track facts introduced in conversation
   */
  trackFacts(facts: string[]): void {
    facts.forEach(fact => this.baselineFacts.add(this.normalizeFact(fact)));
  }

  /**
   * Set conversation goals for evaluation
   */
  setGoals(goals: string[]): void {
    this.conversationGoals = goals;
  }

  /**
   * Measure entity drift - how many entities were lost or distorted
   */
  measureEntityDrift(currentMemory: StructuredMemory): EntityDriftReport {
    const currentEntities = new Set<string>();
    
    // Collect all current entities
    for (const category of Object.values(currentMemory.entities)) {
      category.forEach(entity => currentEntities.add(entity.toLowerCase()));
    }

    const entitiesIntroduced = this.baselineEntities.size;
    const entitiesPreserved = Array.from(this.baselineEntities)
      .filter(entity => currentEntities.has(entity))
      .length;
    const entitiesLost = entitiesIntroduced - entitiesPreserved;

    // Simple drift score: 1 - (preserved / introduced)
    const driftScore = entitiesIntroduced > 0 
      ? 1 - (entitiesPreserved / entitiesIntroduced)
      : 0;

    return {
      entitiesIntroduced,
      entitiesPreserved,
      entitiesLost,
      entitiesDistorted: 0, // TODO: Implement fuzzy matching for distortion
      driftScore,
    };
  }

  /**
   * Measure context retention - how well facts are preserved
   */
  measureContextRetention(currentMemory: StructuredMemory): ContextRetentionReport {
    const currentFacts = new Set(
      currentMemory.facts.map(fact => this.normalizeFact(fact))
    );

    const factsIntroduced = this.baselineFacts.size;
    const factsRecalled = Array.from(this.baselineFacts)
      .filter(fact => {
        // Check if fact is preserved (exact or partial match)
        return Array.from(currentFacts).some(currentFact => 
          currentFact.includes(fact) || fact.includes(currentFact)
        );
      })
      .length;

    const retentionScore = factsIntroduced > 0
      ? factsRecalled / factsIntroduced
      : 1;

    return {
      factsIntroduced,
      factsRecalled,
      retentionScore,
      keyFacts: Array.from(this.baselineFacts),
    };
  }

  /**
   * LLM self-evaluation - ask the model what it remembers
   */
  async performSelfEvaluation(
    conversationHistory: ConversationTurn[],
    currentMemory: StructuredMemory
  ): Promise<{
    rememberedGoals: string[];
    rememberedFacts: string[];
    score: number;
    reasoning: string;
  }> {
    const llm = getLLMService();

    try {
      // Build context from recent history
      const recentContext = conversationHistory
        .slice(-10)
        .map(t => `${t.role}: ${t.content}`)
        .join('\n\n');

      const response = await llm.chat([
        {
          role: 'system',
          content: `You are evaluating your own memory and understanding of a conversation.
Analyze what you currently remember and return a JSON response.`,
        },
        {
          role: 'user',
          content: `Based on the following conversation and your memory, answer these questions:

CONVERSATION CONTEXT:
${recentContext}

YOUR STRUCTURED MEMORY:
Entities: ${JSON.stringify(currentMemory.entities)}
Facts: ${JSON.stringify(currentMemory.facts)}
Goals: ${JSON.stringify(currentMemory.goals)}
Decisions: ${JSON.stringify(currentMemory.decisions)}

EVALUATION QUESTIONS:
1. What is the user trying to accomplish? List their goals.
2. What are the key facts you remember from this conversation?
3. Are there any important details you might have lost?

Return JSON:
{
  "rememberedGoals": ["goal1", "goal2"],
  "rememberedFacts": ["fact1", "fact2"],
  "selfAssessment": "Your honest assessment of memory quality (1-10)",
  "reasoning": "Brief explanation"
}`,
        },
      ], 1000);

      // Parse response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const evaluation = JSON.parse(jsonMatch[0]);
        
        // Calculate score based on self-assessment
        const score = (parseInt(evaluation.selfAssessment) || 5) / 10;

        return {
          rememberedGoals: evaluation.rememberedGoals || [],
          rememberedFacts: evaluation.rememberedFacts || [],
          score,
          reasoning: evaluation.reasoning || '',
        };
      }

      return {
        rememberedGoals: [],
        rememberedFacts: [],
        score: 0.5,
        reasoning: 'Failed to parse self-evaluation',
      };
    } catch (error) {
      console.error('Self-evaluation failed:', error);
      return {
        rememberedGoals: [],
        rememberedFacts: [],
        score: 0.5,
        reasoning: 'Evaluation error',
      };
    }
  }

  /**
   * Calculate overall quality score
   */
  async calculateQualityScore(
    conversationHistory: ConversationTurn[],
    currentMemory: StructuredMemory
  ): Promise<QualityMetrics> {
    // Measure entity drift
    const entityReport = this.measureEntityDrift(currentMemory);
    
    // Measure context retention
    const retentionReport = this.measureContextRetention(currentMemory);
    
    // Perform self-evaluation
    const selfEval = await this.performSelfEvaluation(
      conversationHistory,
      currentMemory
    );

    // Calculate weighted overall score
    const weights = {
      entityDrift: 0.25,      // 25% weight (inverted - lower drift is better)
      contextRetention: 0.35, // 35% weight
      factPreservation: 0.20, // 20% weight
      selfEvaluation: 0.20,   // 20% weight
    };

    const overallScore = 
      (1 - entityReport.driftScore) * weights.entityDrift +
      retentionReport.retentionScore * weights.contextRetention +
      (retentionReport.factsRecalled / Math.max(retentionReport.factsIntroduced, 1)) * weights.factPreservation +
      selfEval.score * weights.selfEvaluation;

    const metrics: QualityMetrics = {
      entityDrift: entityReport.driftScore,
      contextRetention: retentionReport.retentionScore,
      factPreservation: retentionReport.factsRecalled / Math.max(retentionReport.factsIntroduced, 1),
      selfEvaluationScore: selfEval.score,
      overallScore,
      timestamp: new Date().toISOString(),
    };

    this.metricsHistory.push(metrics);

    console.log(`📊 Quality Score: ${(overallScore * 100).toFixed(1)}%`);
    console.log(`   Entity Drift: ${(entityReport.driftScore * 100).toFixed(1)}%`);
    console.log(`   Context Retention: ${(retentionReport.retentionScore * 100).toFixed(1)}%`);
    console.log(`   Self-Evaluation: ${(selfEval.score * 100).toFixed(1)}%`);

    return metrics;
  }

  /**
   * Get quality trend over time
   */
  getQualityTrend(): {
    current: number;
    average: number;
    trend: 'improving' | 'stable' | 'degrading';
  } {
    if (this.metricsHistory.length === 0) {
      return { current: 1, average: 1, trend: 'stable' };
    }

    const scores = this.metricsHistory.map(m => m.overallScore);
    const current = scores[scores.length - 1];
    const average = scores.reduce((sum, s) => sum + s, 0) / scores.length;

    // Calculate trend from last 3 measurements
    let trend: 'improving' | 'stable' | 'degrading' = 'stable';
    if (scores.length >= 3) {
      const recent = scores.slice(-3);
      const firstHalf = recent.slice(0, Math.ceil(recent.length / 2));
      const secondHalf = recent.slice(Math.ceil(recent.length / 2));
      
      const firstAvg = firstHalf.reduce((sum, s) => sum + s, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((sum, s) => sum + s, 0) / secondHalf.length;
      
      if (secondAvg > firstAvg + 0.05) trend = 'improving';
      else if (secondAvg < firstAvg - 0.05) trend = 'degrading';
    }

    return { current, average, trend };
  }

  /**
   * Get all metrics history
   */
  getMetricsHistory(): QualityMetrics[] {
    return [...this.metricsHistory];
  }

  /**
   * Normalize fact for comparison
   */
  private normalizeFact(fact: string): string {
    return fact.toLowerCase().trim().replace(/[^\w\s]/g, '');
  }
}

// Singleton instances per session
const monitorInstances = new Map<string, QualityMonitor>();

export function getQualityMonitor(sessionId: string): QualityMonitor {
  if (!monitorInstances.has(sessionId)) {
    monitorInstances.set(sessionId, new QualityMonitor());
  }
  return monitorInstances.get(sessionId)!;
}

