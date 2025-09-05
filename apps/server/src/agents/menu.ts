import { ExtendedSession } from '../types/session.js';
import { sessionStore } from '../memory/session-store.js';
import { menuState } from '../state/menu.js';
import { agentLogger as logger } from '../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Menu Agent
 * Focuses on sharing menu information and specials
 */
export class MenuAgent {
  private systemPrompt: string = '';

  constructor() {
    this.loadSystemPrompt();
  }

  /**
   * Load system prompt from file
   */
  private async loadSystemPrompt() {
    try {
      const promptPath = path.join(process.cwd(), 'src/llm/system/menu.md');
      this.systemPrompt = await fs.readFile(promptPath, 'utf-8');
    } catch (error) {
      logger.warn('Could not load menu system prompt, using fallback');
      this.systemPrompt = this.getFallbackPrompt();
    }
  }

  /**
   * Generate response for menu inquiries
   */
  async respond(session: ExtendedSession, userInput: string): Promise<string> {
    logger.debug({
      callId: session.callId,
      userInput: userInput.substring(0, 100),
    }, 'Menu agent processing input');

    // Analyze what the user is asking for
    const menuRequest = this.analyzeMenuRequest(userInput);
    
    // Generate response based on request type
    const response = await this.generateMenuResponse(session, menuRequest, userInput);
    
    // Track what menu items we shared
    if (menuRequest.items && menuRequest.items.length > 0) {
      const menuDescriptions = menuRequest.items.map(item => 
        `${item.Name}${item.Price ? ` for $${item.Price}` : ''}`
      );
      sessionStore.update(session.callId, { lastMenuRead: menuDescriptions });
    }

    return response;
  }

  /**
   * Analyze what the user is asking for regarding the menu
   */
  private analyzeMenuRequest(userInput: string): MenuRequest {
    const input = userInput.toLowerCase();
    
    // Check for specific categories
    const categories = menuState.getCategories();
    const requestedCategory = categories.find(cat => 
      input.includes(cat.toLowerCase())
    );

    // Check for specials request
    if (input.includes('special') || input.includes('today')) {
      return {
        type: 'specials',
        items: menuState.getTodaysSpecials(),
      };
    }

    // Check for specific category
    if (requestedCategory) {
      return {
        type: 'category',
        category: requestedCategory,
        items: menuState.getItemsByCategory(requestedCategory),
      };
    }

    // Check for price inquiries
    if (input.includes('price') || input.includes('cost') || input.includes('how much')) {
      return {
        type: 'pricing',
        items: menuState.getAvailableItems(),
      };
    }

    // Check for dietary restrictions
    const dietaryKeywords = ['vegetarian', 'vegan', 'gluten', 'allergy', 'dairy'];
    const dietaryRequest = dietaryKeywords.find(keyword => input.includes(keyword));
    
    if (dietaryRequest) {
      return {
        type: 'dietary',
        dietary: dietaryRequest,
        items: this.filterByDietary(menuState.getAvailableItems(), dietaryRequest),
      };
    }

    // Check for repeat request
    if (input.includes('repeat') || input.includes('again') || input.includes('last')) {
      return {
        type: 'repeat',
        items: [],
      };
    }

    // Default to overview
    return {
      type: 'overview',
      items: menuState.getAvailableItems(),
    };
  }

  /**
   * Generate menu response based on request type
   */
  private async generateMenuResponse(
    session: ExtendedSession, 
    request: MenuRequest, 
    userInput: string
  ): Promise<string> {
    
    switch (request.type) {
      case 'specials':
        return this.handleSpecialsRequest(session, request);
        
      case 'category':
        return this.handleCategoryRequest(session, request);
        
      case 'pricing':
        return this.handlePricingRequest(session, request);
        
      case 'dietary':
        return this.handleDietaryRequest(session, request);
        
      case 'repeat':
        return this.handleRepeatRequest(session);
        
      case 'overview':
      default:
        return this.handleOverviewRequest(session, userInput);
    }
  }

  /**
   * Handle specials request
   */
  private handleSpecialsRequest(session: ExtendedSession, request: MenuRequest): string {
    if (session.transcript.length <= 1) {
      return "I'd love to tell you about our menu! " + menuState.getSpecialsForVoice();
    }

    const specials = menuState.getTodaysSpecials();
    if (specials.length === 0) {
      return "We don't have any special items today, but our regular menu has many delicious options. Would you like to hear about our appetizers, entrees, or desserts?";
    }

    return menuState.getSpecialsForVoice() + " Would you like to hear about anything else on our menu?";
  }

  /**
   * Handle category request
   */
  private handleCategoryRequest(session: ExtendedSession, request: MenuRequest): string {
    if (!request.category) {
      return "What type of food are you interested in? We have appetizers, entrees, desserts, and today's specials.";
    }

    if (!request.items || request.items.length === 0) {
      return `I'm sorry, we don't have any ${request.category.toLowerCase()} items available right now. Would you like to hear about our other options?`;
    }

    const categoryDescription = menuState.getCategoryForVoice(request.category);
    return categoryDescription + " Would you like to hear about any other categories?";
  }

  /**
   * Handle pricing request
   */
  private handlePricingRequest(session: ExtendedSession, request: MenuRequest): string {
    if (!request.items || request.items.length === 0) {
      return "I'd be happy to share pricing information. What specific items are you interested in?";
    }

    // Focus on items with prices
    const itemsWithPrices = request.items.filter(item => item.Price);
    
    if (itemsWithPrices.length === 0) {
      return "Let me get you specific pricing information. What items are you interested in?";
    }

    // Provide a sampling of prices
    const priceExamples = itemsWithPrices.slice(0, 5);
    const priceDescription = menuState.formatForVoice(priceExamples, true);
    
    return `Here are some examples of our pricing: ${priceDescription}. Would you like pricing for any specific items?`;
  }

  /**
   * Handle dietary restrictions request
   */
  private handleDietaryRequest(session: ExtendedSession, request: MenuRequest): string {
    if (!request.dietary) {
      return "I'd be happy to help with dietary accommodations. What specific dietary needs do you have?";
    }

    if (!request.items || request.items.length === 0) {
      return `I don't see any items specifically marked for ${request.dietary} diets, but our kitchen can often make accommodations. Would you like me to tell you about items that could potentially be modified?`;
    }

    const dietaryDescription = menuState.formatForVoice(request.items);
    return `For ${request.dietary} options, I'd recommend: ${dietaryDescription}. Our kitchen can also make modifications to other dishes when possible.`;
  }

  /**
   * Handle repeat request
   */
  private handleRepeatRequest(session: ExtendedSession): string {
    if (session.lastMenuRead && session.lastMenuRead.length > 0) {
      const lastMenu = session.lastMenuRead.join('. ');
      return `Of course! Here are those menu items again: ${lastMenu}`;
    }

    const lastAgentMessage = session.transcript
      .filter(entry => entry.who === 'agent')
      .slice(-1)[0];

    if (lastAgentMessage && lastAgentMessage.text.length > 50) {
      return `Sure! Let me repeat that: ${lastAgentMessage.text}`;
    }

    return "I haven't shared any specific menu items yet. What would you like to hear about?";
  }

  /**
   * Handle general overview request
   */
  private handleOverviewRequest(session: ExtendedSession, userInput: string): string {
    // First interaction
    if (session.transcript.length <= 1) {
      return "I'd love to tell you about our menu! " + menuState.getMenuOverviewForVoice();
    }

    // Subsequent interactions
    const categories = menuState.getCategories();
    const hasSpecials = menuState.getTodaysSpecials().length > 0;

    let response = "Our menu has something for everyone. ";
    
    if (hasSpecials) {
      response += "We have some exciting specials today, plus ";
    }
    
    if (categories.length > 0) {
      response += `our regular ${categories.join(', ')} options. `;
    }
    
    response += "What would you like to hear about first?";
    
    return response;
  }

  /**
   * Filter menu items by dietary restrictions
   */
  private filterByDietary(items: any[], dietary: string): any[] {
    const dietaryLower = dietary.toLowerCase();
    
    return items.filter(item => {
      const notes = (item['Dietary Notes'] || '').toLowerCase();
      
      switch (dietaryLower) {
        case 'vegetarian':
          return notes.includes('vegetarian');
        case 'vegan':
          return notes.includes('vegan');
        case 'gluten':
          return notes.includes('gluten-free') || notes.includes('gluten free');
        default:
          return notes.includes(dietaryLower);
      }
    });
  }

  /**
   * Get fallback system prompt
   */
  private getFallbackPrompt(): string {
    return `You are a menu information agent for a restaurant. Your goal is to share appetizing descriptions of food items, specials, and answer questions about the menu. Be enthusiastic about the food.`;
  }

  /**
   * Get agent info
   */
  getInfo() {
    return {
      name: 'Menu Agent',
      intent: 'menu',
      requiredFields: [],
      optionalFields: [],
      capabilities: ['menu_information', 'specials_sharing', 'dietary_accommodations', 'pricing_information'],
    };
  }
}

/**
 * Menu request interface
 */
interface MenuRequest {
  type: 'specials' | 'category' | 'pricing' | 'dietary' | 'repeat' | 'overview';
  category?: string;
  dietary?: string;
  items?: any[];
}
