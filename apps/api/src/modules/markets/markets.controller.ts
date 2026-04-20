import { Controller, Get, Query } from "@nestjs/common";
import { Public } from "@/common/decorators/public.decorator";
import { GetMarketCandlesDto } from "./dto/get-market-candles.dto";
import { GetMarketOrderBookDto } from "./dto/get-market-order-book.dto";
import { GetMarketOverviewDto } from "./dto/get-market-overview.dto";
import { GetMarketRecentTradesDto } from "./dto/get-market-recent-trades.dto";
import { SearchMarketPairsDto } from "./dto/search-market-pairs.dto";
import { MarketsService } from "./markets.service";

@Public()
@Controller("markets")
export class MarketsController {
  constructor(private readonly marketsService: MarketsService) {}

  @Get("overview")
  getOverview(@Query() query: GetMarketOverviewDto) {
    return this.marketsService.getOverview(query.symbols);
  }

  @Get("pairs")
  searchPairs(@Query() query: SearchMarketPairsDto) {
    return this.marketsService.searchPairs(query.search, query.limit);
  }

  @Get("candles")
  getCandles(@Query() query: GetMarketCandlesDto) {
    return this.marketsService.getCandles(query.symbol, query.interval, query.limit);
  }

  @Get("order-book")
  getOrderBook(@Query() query: GetMarketOrderBookDto) {
    return this.marketsService.getOrderBook(query.symbol, Number.parseInt(query.limit, 10));
  }

  @Get("recent-trades")
  getRecentTrades(@Query() query: GetMarketRecentTradesDto) {
    return this.marketsService.getRecentTrades(query.symbol, query.limit);
  }
}
