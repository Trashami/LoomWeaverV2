namespace LoomWeaver.Modules.Merchants;

public sealed record MerchantDto(
    long Id,
    int CampaignId,
    string StoreName,
    string MerchantName,
    string Tagline,
    string Description,
    string Greeting,
    string ImageUrl,
    string BannerUrl,
    string? LocationKey,
    string LocationName,
    string? NpcKey,
    string NpcName,
    long? RollTableId,
    string RollTableName,
    int BuyRatePercent,
    int MarkupPercent,
    bool IsUnlocked,
    bool IsAtCurrentLocation,
    int PastPurchasesCount,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public sealed record MerchantSummaryDto(
    long Id,
    int CampaignId,
    string StoreName,
    string MerchantName,
    string Tagline,
    string ImageUrl,
    string? LocationKey,
    string LocationName,
    long? RollTableId,
    string RollTableName,
    bool IsUnlocked,
    bool IsAtCurrentLocation,
    bool HasVisited,
    int PastPurchasesCount,
    int InventoryCount
);

public sealed record MerchantInventoryItemDto(
    long Id,
    long MerchantId,
    string ItemKey,
    string Name,
    string ItemType,
    string Rarity,
    string Description,
    decimal BaseValueGp,
    decimal PriceGp,
    int Quantity,
    bool IsFeatured,
    string? PropertiesJson
);

public sealed record MerchantTransactionDto(
    long Id,
    long MerchantId,
    int CampaignId,
    string CharacterKey,
    string CharacterName,
    string TransactionType,
    string ItemName,
    int Quantity,
    decimal UnitPriceGp,
    decimal TotalGp,
    bool UsedPartyFunds,
    DateTime CreatedAt
);

public sealed record WalletDto(
    decimal PersonalGoldGp,
    decimal PersonalSilverSp,
    decimal PersonalCopperCp,
    decimal PartyGoldGp,
    decimal PartySilverSp,
    decimal PartyCopperCp
);

public sealed record CreateMerchantRequest(
    string StoreName,
    string? MerchantName,
    string? Tagline,
    string? Description,
    string? Greeting,
    string? ImageUrl,
    string? BannerUrl,
    string? LocationKey,
    string? LocationName,
    string? NpcKey,
    string? NpcName,
    long? RollTableId,
    string? RollTableName,
    int? BuyRatePercent,
    int? MarkupPercent,
    bool? IsUnlocked
);

public sealed record UpdateMerchantRequest(
    string StoreName,
    string? MerchantName,
    string? Tagline,
    string? Description,
    string? Greeting,
    string? ImageUrl,
    string? BannerUrl,
    string? LocationKey,
    string? LocationName,
    string? NpcKey,
    string? NpcName,
    long? RollTableId,
    string? RollTableName,
    int? BuyRatePercent,
    int? MarkupPercent,
    bool? IsUnlocked
);

public sealed record CreateInventoryItemRequest(
    string ItemKey,
    string Name,
    string? ItemType,
    string? Rarity,
    string? Description,
    decimal BaseValueGp,
    decimal PriceGp,
    int Quantity,
    bool? IsFeatured,
    string? PropertiesJson
);

public sealed record UpdateInventoryItemRequest(
    decimal PriceGp,
    int Quantity,
    bool IsFeatured
);

public sealed record BuyItemRequest(
    long InventoryItemId,
    int Quantity,
    bool UsePartyFunds,
    string CharacterKey,
    string? CharacterName
);

public sealed record SellItemRequest(
    string ItemKey,
    string ItemName,
    string? ItemType,
    string? Rarity,
    string? Description,
    decimal BaseValueGp,
    int Quantity,
    bool DepositToParty,
    string CharacterKey,
    string? CharacterName
);

public sealed record UpdateWalletRequest(
    decimal PersonalGoldGp,
    decimal PartyGoldGp
);

public sealed record RestockFromTableRequest(
    int NumberOfItems,
    bool ClearExisting
);

public sealed record AttachRollTableRequest(
    long RollTableId,
    string? TableName,
    string? SourceBook,
    string? SessionId,
    string? SessionTitle,
    long? MerchantId,
    string? MerchantName,
    string? Notes
);

public sealed record CampaignRollTableDto(
    long Id,
    int CampaignId,
    long RollTableId,
    string TableName,
    string SourceBook,
    string? SessionId,
    string? SessionTitle,
    long? MerchantId,
    string? MerchantName,
    string? Notes,
    bool IsPinned,
    DateTime CreatedAt
);
