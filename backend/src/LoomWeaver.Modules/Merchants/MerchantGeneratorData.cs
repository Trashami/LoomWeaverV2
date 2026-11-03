namespace LoomWeaver.Modules.Merchants;

public static class MerchantGeneratorData
{
    public static readonly IReadOnlyList<string> MerchantTypes = new[]
    {
        "Blacksmith & Armory",
        "Alchemist & Apothecary",
        "Arcane & Wandmaker",
        "General Goods & Provisions",
        "Jeweler & Gemcutter",
        "Curios & Antiquities",
        "Tavern & Brewer",
        "Fletcher & Bowyer",
        "Tailor & Weaver",
        "Wandering Exotic Trader",
    };

    public static readonly IReadOnlyDictionary<string, IReadOnlyList<string>> StoreNamesByType =
        new Dictionary<string, IReadOnlyList<string>>(StringComparer.OrdinalIgnoreCase)
        {
            ["Blacksmith & Armory"] = new[]
            {
                "The Bellows & Anvil", "Ironclad Armory", "Cinder & Sledge", "Drakesmith Forge",
                "The Gilded Edge", "Tempered Steel", "Emberheart Works", "Molten Peak Armory",
                "The Smoldering Gauntlet", "Hearth & Hammer", "Blackiron Blades", "The Adamant Crucible"
            },
            ["Alchemist & Apothecary"] = new[]
            {
                "The Bubbling Cauldron", "Brimstone & Elixirs", "Mandragora Remedies", "The Philosopher's Draught",
                "Vial & Pestle", "Nightshade Apothecary", "The Emerald Distillate", "Verdant Brews",
                "Quicksilver Alchemy", "The Manticore's Philter", "Sunleaf Tinctures", "The Basilisk's Brew"
            },
            ["Arcane & Wandmaker"] = new[]
            {
                "The Starseeker's Codex", "Whispering Runes", "The Astral Prism", "Ocularis Arcana",
                "Wand & Weave", "The Spellbound Quill", "Netherese Artifacts", "Mystic Focus Curios",
                "The Archmage's Closet", "Chronos Arcana", "Rune & Relic", "The Celestial Astrolabe"
            },
            ["General Goods & Provisions"] = new[]
            {
                "The Wayfarer's Pack", "Cobblestone Provisions", "The Pack Mule", "Trailhead Outfitters",
                "The Crossroads Bazaar", "The Rusty Lantern", "Burlap & Barrel", "Homestead Sundries",
                "The Salted Rations", "Frontier Mercantile", "Haven Goods & Sundries", "The Iron Rucksack"
            },
            ["Jeweler & Gemcutter"] = new[]
            {
                "The Faceted Diamond", "The Gilded Chalice", "Lapis & Opal", "The Crown & Carat",
                "Star Sapphire Studio", "Golden Sovereign", "Glittering Trove", "The Radiant Filigree",
                "Silversmith & Sol", "The Jeweled Scabbard"
            },
            ["Curios & Antiquities"] = new[]
            {
                "The Dusty Tome", "Oddities of Oakhaven", "The Raven's Nest", "Relics of the Fallen",
                "Curios of the Underdark", "The Whispering Cabinet", "Memento Arcana", "Lost Realm Treasures",
                "Cobweb Curiosities", "The Chimera's Paw"
            },
            ["Tavern & Brewer"] = new[]
            {
                "The Drunken Dragon", "The Sleeping Manticore", "Foaming Stein Pub", "The Weary Traveler Inn",
                "Hops & Hearth", "The Brazen Boar", "The Whistling Piper", "Stout & Song",
                "The Copper Flagon", "Brimstone Alehouse"
            },
            ["Fletcher & Bowyer"] = new[]
            {
                "The Feathered Shaft", "Silverwood Bows", "The Ranger's Quiver", "Trueflight Armaments",
                "Ironwood Fletcher", "Yew & Sinew", "Windwhisper Bows", "Hawkseye Archery"
            },
            ["Tailor & Weaver"] = new[]
            {
                "The Silk & Shroud", "Velvet & Vellum", "The Threadbare Cloak", "Cobbler & Cowl",
                "The Weaver's Needle", "Loom & Linens", "Moonthread Garments"
            },
            ["Wandering Exotic Trader"] = new[]
            {
                "The Caravan of Miracles", "Far Realm Nomads", "The Sandstrider's Cache", "Drifting Mirage Wares",
                "The Gypsy Drake", "Starlight Peddlers", "The Planar Cart"
            },
        };

    public static readonly IReadOnlyList<string> NpcNames = new[]
    {
        "Thorgar Ironbreaker", "Brynn Fireforge", "Elysia Nightshade", "Alden Silvervein",
        "Kaelen Shadowmend", "Mistress Vael", "Gorrak Bloodaxe", "Fennik Swiftarrow",
        "Barnaby Oakhaven", "Lyra Moonglow", "Durnan Stoutbelly", "Kael Thorne",
        "Seraphina Dawnseeker", "Rorik Stonefist", "Vespera Hex", "Orion Skydancer",
        "Garrick Coppercoin", "Morwen Ravenshade", "Balthazar Quill", "Tressa Wildstride",
        "Grogmar Bonecrusher", "Faelar Sunwhisper", "Rowan Greensleeve", "Cassian Vex",
        "Durgin Oakshield", "Mira Swiftwater", "Jaxom Brassfoot", "Sylas Bitterbrew",
        "Eldrin Starfall", "Nalia Deepdelver", "Brokk Hammerfall", "Zanita Whisperwind",
        "Finnian Barleycorn", "Maeve Shadowstep", "Corvus Blackthorn", "Vondal Battlehammer",
        "Illyria Moonwhisper", "Kraglin Ironjaw", "Delphine Amberfall", "Tobias Finch",
        "Orla Bramblefoot", "Grimm Copperpot", "Aurelia Goldweaver", "Torvin Quickfinger",
        "Hestia Flameheart", "Zephyr Mistwalker", "Bregda Stonegrinder", "Sylphie Dewdrop",
        "Dacian Duskrunner", "Yvaine Starling", "Gideon Ironbark", "Selene Nightbreeze",
        "Branigan Stoutale", "Khorva Ashwalker", "Melisande Ravenscroft", "Thurston Broadbeam",
        "Valeria Sunstone", "Caspian Waverider", "Darvin Tanglewood", "Astrid Winterforge",
        "Quinn Pennywhistle", "Magnus Drakehorn", "Ophelia Belladonna", "Barton Miller",
        "Thistle Merrydown", "Roric Deepforge", "Sariel Silverleaf", "Gurn Rockcrusher",
        "Isolde Frostgale", "Percival Highgate", "Wren Hollowell", "Orson Barrelchew",
        "Zoraida Voidwalker", "Darian Fairweather", "Bixi Nackle", "Varis Holimion",
        "Helga Runecarver", "Clement Goodbarrel", "Nyssa Thornheart", "Boric Anvilborn",
        "Amaryllis Bloom", "Dravok Cinderhide", "Gwenith Cobblepot", "Tarquin Brightwood",
        "Leona Shieldheart", "Corin Featherstone", "Brog Ironhide", "Kallista Hellspark",
        "Roderic Highcliff", "Sybilla Darkwater", "Fintan O'Malley", "Rowena Spellwright",
        "Balthor Kegbreaker", "Evelina Mosswood", "Xander Swiftblade", "Tamsin Honeybee",
        "Varek Bloodfang", "Lunetta Stargazer", "Garrick Redmane", "Zephira Wyrmspeaker",
    };

    public static readonly IReadOnlyList<string> Races = new[]
    {
        "Dwarf", "Elf", "Human", "Halfling", "Gnome", "Half-Orc", "Tiefling", "Dragonborn"
    };

    public static readonly IReadOnlyList<string> Demeanors = new[]
    {
        "Gruff & Pragmatic", "Shrewd Negotiator", "Jovial & Hospitable", "Suspicious & Guarded",
        "Eccentric Collector", "Flamboyant Showman", "Whispering Informant", "Hardened Veteran"
    };

    public static readonly IReadOnlyList<string> Quirks = new[]
    {
        "Constantly polishes an ornate coin between their knuckles.",
        "Bows low with theatrical flourish whenever gold is mentioned.",
        "Speaks in quiet murmurs, always glancing toward the shop doorway.",
        "Insists on biting every coin to test its mineral purity.",
        "Keeps a pet mechanical bird on their shoulder that chirps when anyone enters.",
        "Knows every juicy rumor from the tavern down the street.",
        "Wears spectacles with three rotating tinted lenses for inspecting gemstones.",
        "Never sells an item without sharing a dramatic backstory about its origin.",
        "Has an enormous ledger and writes down every customer's name with ornate script.",
        "Always offers guests a small warm mug of bitter herbal tea.",
        "Mutters under their breath about rival merchants cheating on tax.",
        "Has an uncanny memory for past bargains made years ago.",
    };

    public static MerchantNpcDto GenerateNpc(string? merchantType, string? locationName)
    {
        var rng = new Random();
        var name = NpcNames[rng.Next(NpcNames.Count)];
        var race = Races[rng.Next(Races.Count)];
        var type = string.IsNullOrWhiteSpace(merchantType) ? MerchantTypes[rng.Next(MerchantTypes.Count)] : merchantType;
        var demeanor = Demeanors[rng.Next(Demeanors.Count)];
        var quirk = Quirks[rng.Next(Quirks.Count)];
        var dc = rng.Next(12, 17); // DC 12-16

        return new MerchantNpcDto(
            Name: name,
            Race: race,
            MerchantType: type,
            Demeanor: demeanor,
            Quirk: quirk,
            PersuasionDc: dc,
            Strength: rng.Next(10, 16),
            Dexterity: rng.Next(10, 15),
            Constitution: rng.Next(11, 16),
            Intelligence: rng.Next(11, 17),
            Wisdom: rng.Next(12, 16),
            Charisma: rng.Next(11, 17),
            ArmorClass: rng.Next(11, 16),
            HitPoints: rng.Next(18, 48),
            LocationName: string.IsNullOrWhiteSpace(locationName) ? "Active Settlement" : locationName
        );
    }

    public static string GenerateStoreName(string merchantType)
    {
        var rng = new Random();
        if (StoreNamesByType.TryGetValue(merchantType, out var list) && list.Count > 0)
        {
            return list[rng.Next(list.Count)];
        }
        var all = StoreNamesByType.Values.SelectMany(x => x).ToList();
        return all[rng.Next(all.Count)];
    }

    public static IReadOnlyList<(string Name, string Type, string Rarity, string Desc, decimal BaseGp, decimal PriceGp, int Qty, bool Featured)> GetTypeStarterStock(string merchantType, int markupPercent)
    {
        var m = Math.Max(50, markupPercent) / 100m;
        return merchantType switch
        {
            "Blacksmith & Armory" => new[]
            {
                ("Longsword", "Weapon", "common", "Versatile blade forged of high-carbon steel.", 15m, Math.Round(15m * m, 2), 3, true),
                ("Shield +1", "Armor", "uncommon", "+1 magically reinforced kite shield bearing dwarven steel inlay.", 250m, Math.Round(250m * m, 2), 1, true),
                ("Chain Shirt", "Armor", "common", "Interlocking metal rings worn between layers of clothing.", 50m, Math.Round(50m * m, 2), 2, false),
                ("Warhammer", "Weapon", "common", "Heavy bludgeoning head with a back spike.", 15m, Math.Round(15m * m, 2), 2, false),
                ("Fine Whetstone (3-pack)", "Adventuring Gear", "common", "Restores keen edges and grants minor maintenance.", 5m, Math.Round(5m * m, 2), 6, false),
                ("Crossbow Bolts (case of 20)", "Ammunition", "common", "Steel-tipped quarrel bolts.", 2m, Math.Round(2m * m, 2), 5, false),
            },
            "Alchemist & Apothecary" => new[]
            {
                ("Potion of Healing", "Potion", "common", "Regains 2d4+2 hit points when consumed.", 50m, Math.Round(50m * m, 2), 6, true),
                ("Potion of Greater Healing", "Potion", "uncommon", "Regains 4d4+4 hit points.", 150m, Math.Round(150m * m, 2), 2, true),
                ("Alchemist's Fire (flask)", "Adventuring Gear", "common", "Ignites on contact with air dealing 1d4 fire per round.", 50m, Math.Round(50m * m, 2), 4, false),
                ("Antitoxin", "Adventuring Gear", "common", "Grants advantage on saves against poison for 1 hour.", 50m, Math.Round(50m * m, 2), 3, false),
                ("Herbalism Salve", "Adventuring Gear", "common", "Soothing poultice for wounds and burns.", 25m, Math.Round(25m * m, 2), 5, false),
                ("Oil of Slipperiness", "Potion", "uncommon", "Provides Freedom of Movement for 8 hours.", 200m, Math.Round(200m * m, 2), 1, false),
            },
            "Arcane & Wandmaker" => new[]
            {
                ("Spell Scroll (1st Level - Shield)", "Scroll", "common", "Instantly triggers the Shield spell when read.", 75m, Math.Round(75m * m, 2), 2, true),
                ("Wand of the War Mage +1", "Wand", "uncommon", "Grants +1 to spell attack rolls and ignores half cover.", 350m, Math.Round(350m * m, 2), 1, true),
                ("Pearl of Power", "Wondrous Item", "uncommon", "Allows a spellcaster to regain one expended spell slot up to 3rd level.", 450m, Math.Round(450m * m, 2), 1, true),
                ("Component Pouch", "Adventuring Gear", "common", "Watertight leather pouch containing everyday spell reagents.", 25m, Math.Round(25m * m, 2), 3, false),
                ("Arcane Focus - Crystal Wand", "Focus", "common", "Faceted quartz wand tuned to spellcasting harmonics.", 20m, Math.Round(20m * m, 2), 3, false),
                ("Scroll of Detect Magic", "Scroll", "common", "Ritual divination scroll inscribed in silver ink.", 50m, Math.Round(50m * m, 2), 3, false),
            },
            "Jeweler & Gemcutter" => new[]
            {
                ("Ring of Protection", "Ring", "rare", "Grants +1 bonus to Armor Class and saving throws.", 1200m, Math.Round(1200m * m, 2), 1, true),
                ("Faceted Star Sapphire (100 gp)", "Valuables", "uncommon", "Deep blue gemstone reflecting a six-pointed star.", 100m, Math.Round(100m * m, 2), 4, true),
                ("Silver Signet Amulet", "Wondrous Item", "common", "Fine filigree pendant suitable for enspelling.", 45m, Math.Round(45m * m, 2), 3, false),
                ("Cut Bloodstone Gem", "Valuables", "common", "Dark green jasper flecked with red hematite.", 50m, Math.Round(50m * m, 2), 5, false),
                ("Gold Wire Choker", "Valuables", "uncommon", "Delicately twisted gold choker with ruby studs.", 180m, Math.Round(180m * m, 2), 2, false),
            },
            _ => new[]
            {
                ("Explorer's Pack", "Adventuring Gear", "common", "Includes bedroll, mess kit, rations, torches, and waterskin.", 10m, Math.Round(10m * m, 2), 4, true),
                ("Silk Rope (50 feet)", "Adventuring Gear", "common", "Lightweight, sturdy braided silk rope.", 10m, Math.Round(10m * m, 2), 4, false),
                ("Hooded Lantern", "Adventuring Gear", "common", "Casts bright light in a 30-foot radius with shutter.", 5m, Math.Round(5m * m, 2), 3, false),
                ("Iron Rations (10 days)", "Adventuring Gear", "common", "Preserved meats, dried fruit, and travel bread.", 5m, Math.Round(5m * m, 2), 10, true),
                ("Grappling Hook", "Adventuring Gear", "common", "Three-pronged iron anchor for climbing rope.", 2m, Math.Round(2m * m, 2), 3, false),
                ("Potion of Healing", "Potion", "common", "Restores 2d4+2 hit points.", 50m, Math.Round(50m * m, 2), 3, true),
            }
        };
    }
}
