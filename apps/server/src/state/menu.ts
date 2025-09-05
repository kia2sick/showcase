import { AirtableMenuItem } from '../types/services.js';
import { createLogger } from '../utils/logger.js';
import { config } from '../utils/env.js';

const logger = createLogger('menu');

/**
 * Menu state management with dynamic loading from Airtable
 * Falls back to mock data if Airtable is not configured
 */
class MenuState {
  private menuItems: AirtableMenuItem[] = [];
  private lastUpdated: number = 0;
  private updateInterval: NodeJS.Timeout | null = null;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.loadInitialMenu();
    
    // Update menu every 5 minutes
    this.updateInterval = setInterval(() => {
      this.refreshMenu();
    }, this.CACHE_TTL);
  }

  /**
   * Load initial menu data
   */
  private async loadInitialMenu() {
    try {
      if (config.AIRTABLE_API_KEY && config.AIRTABLE_BASE_ID) {
        // TODO: Load from Airtable when service is implemented
        logger.info('Airtable configured, will load menu from Airtable');
      }
      
      // Use mock data for now
      this.menuItems = this.getMockMenuItems();
      this.lastUpdated = Date.now();
      
      logger.info({ itemCount: this.menuItems.length }, 'Menu loaded');
    } catch (error) {
      logger.error({ error }, 'Failed to load initial menu');
      this.menuItems = this.getMockMenuItems();
      this.lastUpdated = Date.now();
    }
  }

  /**
   * Refresh menu from data source
   */
  private async refreshMenu() {
    try {
      // TODO: Implement Airtable refresh
      logger.debug('Menu refresh - using cached data');
    } catch (error) {
      logger.error({ error }, 'Failed to refresh menu');
    }
  }

  /**
   * Get all available menu items
   */
  getAvailableItems(): AirtableMenuItem[] {
    return this.menuItems.filter(item => item.Available);
  }

  /**
   * Get menu items by category
   */
  getItemsByCategory(category: string): AirtableMenuItem[] {
    return this.getAvailableItems().filter(
      item => item.Category?.toLowerCase() === category.toLowerCase()
    );
  }

  /**
   * Get today's specials
   */
  getTodaysSpecials(): AirtableMenuItem[] {
    return this.getAvailableItems().filter(
      item => item.Category?.toLowerCase() === 'special'
    );
  }

  /**
   * Get categories
   */
  getCategories(): string[] {
    const categories = new Set(
      this.getAvailableItems()
        .map(item => item.Category)
        .filter(Boolean)
    );
    return Array.from(categories);
  }

  /**
   * Format menu for voice response
   */
  formatForVoice(items: AirtableMenuItem[], includePrice = true): string {
    if (items.length === 0) {
      return 'No items available at the moment.';
    }

    return items.map(item => {
      let description = item.Name;
      
      if (item.Description) {
        description += ` - ${item.Description}`;
      }
      
      if (includePrice && item.Price) {
        description += ` for $${item.Price}`;
      }
      
      if (item['Dietary Notes']) {
        description += ` (${item['Dietary Notes']})`;
      }
      
      return description;
    }).join('. ');
  }

  /**
   * Get formatted specials for voice
   */
  getSpecialsForVoice(): string {
    const specials = this.getTodaysSpecials();
    
    if (specials.length === 0) {
      return "We don't have any special items today, but our regular menu has many delicious options.";
    }
    
    const formatted = this.formatForVoice(specials);
    return `Today's specials are: ${formatted}`;
  }

  /**
   * Get formatted category menu for voice
   */
  getCategoryForVoice(category: string): string {
    const items = this.getItemsByCategory(category);
    
    if (items.length === 0) {
      return `We don't have any ${category} items available right now.`;
    }
    
    const formatted = this.formatForVoice(items);
    return `Our ${category} options include: ${formatted}`;
  }

  /**
   * Get menu overview for voice
   */
  getMenuOverviewForVoice(): string {
    const categories = this.getCategories();
    const specials = this.getTodaysSpecials();
    
    let overview = '';
    
    if (specials.length > 0) {
      overview += this.getSpecialsForVoice() + ' ';
    }
    
    if (categories.length > 0) {
      overview += `We also have ${categories.join(', ')} available. `;
    }
    
    overview += 'Would you like to hear about any specific category or our specials?';
    
    return overview;
  }

  /**
   * Mock menu items for development
   */
  private getMockMenuItems(): AirtableMenuItem[] {
    return [
      {
        Name: 'Grilled Salmon',
        Description: 'Fresh Atlantic salmon with lemon herb butter',
        Price: 28,
        Category: 'Entree',
        Available: true,
        'Dietary Notes': 'Gluten-free available',
      },
      {
        Name: 'Beef Tenderloin',
        Description: 'Prime cut with roasted vegetables and red wine reduction',
        Price: 42,
        Category: 'Entree',
        Available: true,
      },
      {
        Name: 'Vegetarian Pasta',
        Description: 'House-made pasta with seasonal vegetables',
        Price: 22,
        Category: 'Entree',
        Available: true,
        'Dietary Notes': 'Vegetarian, vegan option available',
      },
      {
        Name: 'Caesar Salad',
        Description: 'Crisp romaine with house-made dressing and croutons',
        Price: 14,
        Category: 'Appetizer',
        Available: true,
      },
      {
        Name: 'Lobster Bisque',
        Description: 'Rich and creamy with fresh lobster',
        Price: 16,
        Category: 'Appetizer',
        Available: true,
      },
      {
        Name: 'Chocolate Lava Cake',
        Description: 'Warm chocolate cake with vanilla ice cream',
        Price: 12,
        Category: 'Dessert',
        Available: true,
      },
      {
        Name: 'Pan-Seared Duck',
        Description: 'Confit duck leg with cherry gastrique',
        Price: 36,
        Category: 'Special',
        Available: true,
        'Dietary Notes': 'Limited quantity',
      },
      {
        Name: 'Truffle Risotto',
        Description: 'Arborio rice with black truffle and parmesan',
        Price: 32,
        Category: 'Special',
        Available: true,
        'Dietary Notes': 'Vegetarian',
      },
    ];
  }

  /**
   * Get cache status
   */
  getCacheInfo() {
    return {
      itemCount: this.menuItems.length,
      lastUpdated: this.lastUpdated,
      isStale: Date.now() - this.lastUpdated > this.CACHE_TTL,
    };
  }

  /**
   * Force refresh
   */
  async forceRefresh(): Promise<void> {
    await this.refreshMenu();
  }

  /**
   * Shutdown
   */
  shutdown() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    logger.info('Menu state shutdown');
  }
}

// Singleton instance
export const menuState = new MenuState();

// Seed script functionality
if (process.argv.includes('--seed')) {
  logger.info('Seeding menu data...');
  console.log('Menu items:');
  menuState.getAvailableItems().forEach((item, index) => {
    console.log(`${index + 1}. ${item.Name} - $${item.Price} (${item.Category})`);
  });
  console.log('\nSpecials for voice:');
  console.log(menuState.getSpecialsForVoice());
  process.exit(0);
}

export { MenuState };
