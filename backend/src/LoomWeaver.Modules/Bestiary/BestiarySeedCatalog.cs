using LoomWeaver.Domain;

namespace LoomWeaver.Modules.Bestiary;

/// <summary>
/// Offline fallback used only when the loomweaver MySQL compendium (dnd_monster_library) is unreachable,
/// so local development without the SSH tunnel still renders a working bestiary. SRD 5.1 statblocks.
/// </summary>
public static class BestiarySeedCatalog
{
    public sealed record SeedMonster(BestiaryMonsterSummaryDto Summary, string RawJson);

    private static readonly (string Slug, string Name, string Cr, string Size, string Type, int Ac, int Hp, string Raw)[] Rows =
    {
        ("kobold", "Kobold", "1/8", "S", "humanoid", 12, 5, """
            {"size":["S"],"type":{"type":"humanoid","tags":["kobold"]},"alignment":["L","E"],"ac":[12],"hp":{"average":5,"formula":"2d6 - 2"},"speed":{"walk":30},"str":7,"dex":15,"con":9,"int":8,"wis":7,"cha":8,"senses":["darkvision 60 ft."],"passive":8,"languages":["Common","Draconic"],"cr":"1/8",
             "trait":[{"name":"Sunlight Sensitivity","entries":["While in sunlight, the kobold has disadvantage on attack rolls and Wisdom (Perception) checks that rely on sight."]},{"name":"Pack Tactics","entries":["The kobold has advantage on an attack roll against a creature if at least one of the kobold's allies is within 5 feet of the creature and the ally isn't incapacitated."]}],
             "action":[{"name":"Dagger","entries":["{@atk mw} {@hit 4} to hit, reach 5 ft., one target. {@h}4 ({@damage 1d4 + 2}) piercing damage."]},{"name":"Sling","entries":["{@atk rw} {@hit 4} to hit, range 30/120 ft., one target. {@h}4 ({@damage 1d4 + 2}) bludgeoning damage."]}],"environment":["underdark","mountain","forest"]}
            """),
        ("goblin", "Goblin", "1/4", "S", "humanoid", 15, 7, """
            {"size":["S"],"type":{"type":"humanoid","tags":["goblinoid"]},"alignment":["N","E"],"ac":[{"ac":15,"from":["leather armor","shield"]}],"hp":{"average":7,"formula":"2d6"},"speed":{"walk":30},"str":8,"dex":14,"con":10,"int":10,"wis":8,"cha":8,"skill":{"stealth":"+6"},"senses":["darkvision 60 ft."],"passive":9,"languages":["Common","Goblin"],"cr":"1/4",
             "trait":[{"name":"Nimble Escape","entries":["The goblin can take the Disengage or Hide action as a bonus action on each of its turns."]}],
             "action":[{"name":"Scimitar","entries":["{@atk mw} {@hit 4} to hit, reach 5 ft., one target. {@h}5 ({@damage 1d6 + 2}) slashing damage."]},{"name":"Shortbow","entries":["{@atk rw} {@hit 4} to hit, range 80/320 ft., one target. {@h}5 ({@damage 1d6 + 2}) piercing damage."]}],"environment":["forest","hill","underdark"]}
            """),
        ("wolf", "Wolf", "1/4", "M", "beast", 13, 11, """
            {"size":["M"],"type":"beast","alignment":["U"],"ac":[{"ac":13,"from":["natural armor"]}],"hp":{"average":11,"formula":"2d8 + 2"},"speed":{"walk":40},"str":12,"dex":15,"con":12,"int":3,"wis":12,"cha":6,"skill":{"perception":"+3","stealth":"+4"},"passive":13,"cr":"1/4",
             "trait":[{"name":"Keen Hearing and Smell","entries":["The wolf has advantage on Wisdom (Perception) checks that rely on hearing or smell."]},{"name":"Pack Tactics","entries":["The wolf has advantage on an attack roll against a creature if at least one of the wolf's allies is within 5 feet of the creature and the ally isn't incapacitated."]}],
             "action":[{"name":"Bite","entries":["{@atk mw} {@hit 4} to hit, reach 5 ft., one target. {@h}7 ({@damage 2d4 + 2}) piercing damage. If the target is a creature, it must succeed on a {@dc 11} Strength saving throw or be knocked prone."]}],"environment":["forest","grassland","hill"]}
            """),
        ("skeleton", "Skeleton", "1/4", "M", "undead", 13, 13, """
            {"size":["M"],"type":"undead","alignment":["L","E"],"ac":[{"ac":13,"from":["armor scraps"]}],"hp":{"average":13,"formula":"2d8 + 4"},"speed":{"walk":30},"str":10,"dex":14,"con":15,"int":6,"wis":8,"cha":5,"senses":["darkvision 60 ft."],"passive":9,"immune":["poison"],"conditionImmune":["exhaustion","poisoned"],"languages":["understands all languages it knew in life but can't speak"],"cr":"1/4",
             "action":[{"name":"Shortsword","entries":["{@atk mw} {@hit 4} to hit, reach 5 ft., one target. {@h}5 ({@damage 1d6 + 2}) piercing damage."]},{"name":"Shortbow","entries":["{@atk rw} {@hit 4} to hit, range 80/320 ft., one target. {@h}5 ({@damage 1d6 + 2}) piercing damage."]}],"environment":["underdark","urban"]}
            """),
        ("zombie", "Zombie", "1/4", "M", "undead", 8, 22, """
            {"size":["M"],"type":"undead","alignment":["N","E"],"ac":[8],"hp":{"average":22,"formula":"3d8 + 9"},"speed":{"walk":20},"str":13,"dex":6,"con":16,"int":3,"wis":6,"cha":5,"save":{"wis":"+0"},"senses":["darkvision 60 ft."],"passive":8,"immune":["poison"],"conditionImmune":["poisoned"],"languages":["understands the languages it knew in life but can't speak"],"cr":"1/4",
             "trait":[{"name":"Undead Fortitude","entries":["If damage reduces the zombie to 0 hit points, it must make a Constitution saving throw with a DC of 5 + the damage taken, unless the damage is radiant or from a critical hit. On a success, the zombie drops to 1 hit point instead."]}],
             "action":[{"name":"Slam","entries":["{@atk mw} {@hit 3} to hit, reach 5 ft., one target. {@h}4 ({@damage 1d6 + 1}) bludgeoning damage."]}],"environment":["urban","swamp"]}
            """),
        ("orc", "Orc", "1/2", "M", "humanoid", 13, 15, """
            {"size":["M"],"type":{"type":"humanoid","tags":["orc"]},"alignment":["C","E"],"ac":[{"ac":13,"from":["hide armor"]}],"hp":{"average":15,"formula":"2d8 + 6"},"speed":{"walk":30},"str":16,"dex":12,"con":16,"int":7,"wis":11,"cha":10,"skill":{"intimidation":"+2"},"senses":["darkvision 60 ft."],"passive":10,"languages":["Common","Orc"],"cr":"1/2",
             "trait":[{"name":"Aggressive","entries":["As a bonus action, the orc can move up to its speed toward a hostile creature that it can see."]}],
             "action":[{"name":"Greataxe","entries":["{@atk mw} {@hit 5} to hit, reach 5 ft., one target. {@h}9 ({@damage 1d12 + 3}) slashing damage."]},{"name":"Javelin","entries":["{@atk mw,rw} {@hit 5} to hit, reach 5 ft. or range 30/120 ft., one target. {@h}6 ({@damage 1d6 + 3}) piercing damage."]}],"environment":["mountain","hill","grassland"]}
            """),
        ("bugbear", "Bugbear", "1", "M", "humanoid", 16, 27, """
            {"size":["M"],"type":{"type":"humanoid","tags":["goblinoid"]},"alignment":["C","E"],"ac":[{"ac":16,"from":["hide armor","shield"]}],"hp":{"average":27,"formula":"5d8 + 5"},"speed":{"walk":30},"str":15,"dex":14,"con":13,"int":8,"wis":11,"cha":9,"skill":{"stealth":"+6","survival":"+2"},"senses":["darkvision 60 ft."],"passive":10,"languages":["Common","Goblin"],"cr":"1",
             "trait":[{"name":"Brute","entries":["A melee weapon deals one extra die of its damage when the bugbear hits with it (included in the attack)."]},{"name":"Surprise Attack","entries":["If the bugbear surprises a creature and hits it with an attack during the first round of combat, the target takes an extra 7 ({@damage 2d6}) damage from the attack."]}],
             "action":[{"name":"Morningstar","entries":["{@atk mw} {@hit 4} to hit, reach 5 ft., one target. {@h}11 ({@damage 2d8 + 2}) piercing damage."]}],"environment":["forest","underdark"]}
            """),
        ("ghoul", "Ghoul", "1", "M", "undead", 12, 22, """
            {"size":["M"],"type":"undead","alignment":["C","E"],"ac":[12],"hp":{"average":22,"formula":"5d8"},"speed":{"walk":30},"str":13,"dex":15,"con":10,"int":7,"wis":10,"cha":6,"senses":["darkvision 60 ft."],"passive":10,"immune":["poison"],"conditionImmune":["charmed","exhaustion","poisoned"],"languages":["Common"],"cr":"1",
             "action":[{"name":"Bite","entries":["{@atk mw} {@hit 2} to hit, reach 5 ft., one creature. {@h}9 ({@damage 2d6 + 2}) piercing damage."]},{"name":"Claws","entries":["{@atk mw} {@hit 4} to hit, reach 5 ft., one target. {@h}7 ({@damage 2d4 + 2}) slashing damage. If the target is a creature other than an elf or undead, it must succeed on a {@dc 10} Constitution saving throw or be paralyzed for 1 minute."]}],"environment":["underdark","swamp","urban"]}
            """),
        ("owlbear", "Owlbear", "3", "L", "monstrosity", 13, 59, """
            {"size":["L"],"type":"monstrosity","alignment":["U"],"ac":[{"ac":13,"from":["natural armor"]}],"hp":{"average":59,"formula":"7d10 + 21"},"speed":{"walk":40},"str":20,"dex":12,"con":17,"int":3,"wis":12,"cha":7,"skill":{"perception":"+3"},"senses":["darkvision 60 ft."],"passive":13,"cr":"3",
             "trait":[{"name":"Keen Sight and Smell","entries":["The owlbear has advantage on Wisdom (Perception) checks that rely on sight or smell."]}],
             "action":[{"name":"Multiattack","entries":["The owlbear makes two attacks: one with its beak and one with its claws."]},{"name":"Beak","entries":["{@atk mw} {@hit 7} to hit, reach 5 ft., one creature. {@h}10 ({@damage 1d10 + 5}) piercing damage."]},{"name":"Claws","entries":["{@atk mw} {@hit 7} to hit, reach 5 ft., one target. {@h}14 ({@damage 2d8 + 5}) slashing damage."]}],"environment":["forest"]}
            """),
        ("vampire-spawn", "Vampire Spawn", "5", "M", "undead", 15, 82, """
            {"size":["M"],"type":"undead","alignment":["N","E"],"ac":[{"ac":15,"from":["natural armor"]}],"hp":{"average":82,"formula":"11d8 + 33"},"speed":{"walk":30},"str":16,"dex":16,"con":16,"int":11,"wis":10,"cha":12,"save":{"dex":"+6","wis":"+3"},"skill":{"perception":"+3","stealth":"+6"},"senses":["darkvision 60 ft."],"passive":13,"resist":["necrotic",{"resist":["bludgeoning","piercing","slashing"],"note":"from nonmagical attacks"}],"languages":["the languages it knew in life"],"cr":"5",
             "trait":[{"name":"Regeneration","entries":["The vampire regains 10 hit points at the start of its turn if it has at least 1 hit point and isn't in sunlight or running water."]},{"name":"Spider Climb","entries":["The vampire can climb difficult surfaces, including upside down on ceilings, without needing to make an ability check."]}],
             "action":[{"name":"Multiattack","entries":["The vampire makes two attacks, only one of which can be a bite attack."]},{"name":"Claws","entries":["{@atk mw} {@hit 6} to hit, reach 5 ft., one creature. {@h}8 ({@damage 2d4 + 3}) slashing damage."]},{"name":"Bite","entries":["{@atk mw} {@hit 6} to hit, reach 5 ft., one willing creature, or a creature that is grappled by the vampire. {@h}6 ({@damage 1d6 + 3}) piercing damage plus 7 ({@damage 2d6}) necrotic damage."]}],"environment":["urban"]}
            """),
        ("troll", "Troll", "5", "L", "giant", 15, 84, """
            {"size":["L"],"type":"giant","alignment":["C","E"],"ac":[{"ac":15,"from":["natural armor"]}],"hp":{"average":84,"formula":"8d10 + 40"},"speed":{"walk":30},"str":18,"dex":13,"con":20,"int":7,"wis":9,"cha":7,"skill":{"perception":"+2"},"senses":["darkvision 60 ft."],"passive":12,"languages":["Giant"],"cr":"5",
             "trait":[{"name":"Keen Smell","entries":["The troll has advantage on Wisdom (Perception) checks that rely on smell."]},{"name":"Regeneration","entries":["The troll regains 10 hit points at the start of its turn. If the troll takes acid or fire damage, this trait doesn't function at the start of the troll's next turn."]}],
             "action":[{"name":"Multiattack","entries":["The troll makes three attacks: one with its bite and two with its claws."]},{"name":"Bite","entries":["{@atk mw} {@hit 7} to hit, reach 5 ft., one target. {@h}7 ({@damage 1d6 + 4}) piercing damage."]},{"name":"Claw","entries":["{@atk mw} {@hit 7} to hit, reach 5 ft., one target. {@h}11 ({@damage 2d6 + 4}) slashing damage."]}],"environment":["forest","hill","mountain","swamp"]}
            """),
        ("young-red-dragon", "Young Red Dragon", "10", "L", "dragon", 18, 178, """
            {"size":["L"],"type":"dragon","alignment":["C","E"],"ac":[{"ac":18,"from":["natural armor"]}],"hp":{"average":178,"formula":"17d10 + 85"},"speed":{"walk":40,"climb":40,"fly":80},"str":23,"dex":10,"con":21,"int":14,"wis":11,"cha":19,"save":{"dex":"+4","con":"+9","wis":"+4","cha":"+8"},"skill":{"perception":"+8","stealth":"+4"},"senses":["blindsight 30 ft.","darkvision 120 ft."],"passive":18,"immune":["fire"],"languages":["Common","Draconic"],"cr":"10",
             "action":[{"name":"Multiattack","entries":["The dragon makes three attacks: one with its bite and two with its claws."]},{"name":"Bite","entries":["{@atk mw} {@hit 10} to hit, reach 10 ft., one target. {@h}17 ({@damage 2d10 + 6}) piercing damage plus 3 ({@damage 1d6}) fire damage."]},{"name":"Claw","entries":["{@atk mw} {@hit 10} to hit, reach 5 ft., one target. {@h}13 ({@damage 2d6 + 6}) slashing damage."]},{"name":"Fire Breath {@recharge 5}","entries":["The dragon exhales fire in a 30-foot cone. Each creature in that area must make a {@dc 17} Dexterity saving throw, taking 56 ({@damage 16d6}) fire damage on a failed save, or half as much damage on a successful one."]}],"environment":["mountain","hill"]}
            """)
    };

    public static IReadOnlyList<SeedMonster> All { get; } = Rows.Select(r =>
    {
        var size = BestiaryStatblockMapper.SizeLabel(r.Size);
        var summary = new BestiaryMonsterSummaryDto(
            $"off-seed-{r.Slug}",
            r.Name,
            $"/5etools/bestiary/MM/{r.Name}.webp",
            $"/5etools/bestiary/tokens/MM/{r.Name}.webp",
            "",
            r.Cr,
            BestiaryStatblockMapper.CrToNumber(r.Cr),
            r.Type,
            size,
            "MM",
            r.Ac,
            r.Hp,
            false,
            true,
            null,
            false);
        var detail = BestiaryDetailFactory.FromRawJson(summary, r.Raw);
        var firstTrait = detail.Traits.FirstOrDefault()?.Name;
        var firstAction = detail.Actions.FirstOrDefault(a => !a.Name.Equals("Multiattack", StringComparison.OrdinalIgnoreCase))?.Name;
        var shortDescription = BestiaryDetailFactory.BuildShortDescription(size, r.Type, detail.Alignment, firstTrait, firstAction);
        return new SeedMonster(summary with { ShortDescription = shortDescription }, r.Raw);
    }).ToList();
}
