import { Module } from '@nitrostack/core';
import { OrderbookService } from './orderbook.service.js';
import { OrderBookResource } from './orderbook.resource.js';
import { DbModule } from '../db/db.module.js';
import { MarketModule } from '../market/market.module.js';
import { MarketTools } from '../market/market.tools.js';

/**
 * OrderbookModule — orderbook management and analysis
 */
@Module({
  name: 'orderbook',
  description: 'Orderbook management, snapshots, and microstructure analysis',
  imports: [DbModule, MarketModule],
  providers: [OrderbookService],
  controllers: [OrderBookResource, MarketTools],
  exports: [OrderbookService, OrderBookResource, MarketTools]
})
export class OrderbookModule {}
