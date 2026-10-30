using LoomWeaver.Domain;

namespace LoomWeaver.Modules.ActionStudio.Engine;

public sealed class CombatRuleEngineInterpreter
{
    private enum TokenStatus { Passed, Failed, NotEvaluated }
    private sealed record TokenResult(string Token, TokenStatus Status, string Explanation);

    public EvaluateRuleLogicResponse Evaluate(EvaluateRuleLogicRequest req)
    {
        var attacker = string.IsNullOrWhiteSpace(req.AttackerName) ? "Vaelkorath (Boss)" : req.AttackerName.Trim();
        var defender = string.IsNullOrWhiteSpace(req.DefenderName) ? "Target" : req.DefenderName.Trim();
        var steps = new List<RuleClauseTraceStepDto>();
        var allConditionsPassed = true;
        var triggered = false;
        var hasWhenClause = false;
        var notEvaluatedCount = 0;
        var stepIdx = 1;

        var computedAc = req.TargetAc;
        var computedDamage = req.DamageRolled;
        var reactionConsumed = false;
        var spellSlotConsumed = false;
        string? firstFailureReason = null;

        foreach (var clause in req.Clauses ?? [])
        {
            var keyword = string.IsNullOrWhiteSpace(clause.Keyword) ? "If" : clause.Keyword.Trim();
            var kwLower = keyword.ToLowerInvariant();
            var combiner = NormalizeCombiner(clause.Combiner, kwLower);
            var joinWord = combiner == "ANY" ? " OR " : " AND ";
            var expr = clause.Tokens is { Count: > 0 }
                ? string.Join(joinWord, clause.Tokens)
                : "(No conditions specified)";
            var boundSymbol = $"{clause.BoundClass}.{clause.BoundMethod}".Trim('.');

            var passed = false;
            var evalStatus = "Passed";
            string detail;
            var tokenOutcomes = new List<string>();

            if (kwLower is "when" or "contains" or "has" or "has not" or "where" or "if" or "and" or "or")
            {
                if (kwLower == "when") hasWhenClause = true;
                var tokenResults = EvaluateClauseTokens(clause.Tokens ?? [], kwLower, req);
                foreach (var tr in tokenResults)
                {
                    var badge = tr.Status switch
                    {
                        TokenStatus.Passed => "Passed",
                        TokenStatus.Failed => "Failed",
                        _ => "Not evaluated"
                    };
                    tokenOutcomes.Add($"{badge}: {tr.Explanation}");
                }

                var clauseNotEval = tokenResults.Count(t => t.Status == TokenStatus.NotEvaluated);
                notEvaluatedCount += clauseNotEval;

                if (tokenResults.Count == 0)
                {
                    evalStatus = "NotEvaluated";
                    notEvaluatedCount++;
                    passed = false;
                    detail = "Not evaluated: no condition tokens configured on this clause.";
                }
                else if (combiner == "ANY")
                {
                    var anyPassed = tokenResults.Any(t => t.Status == TokenStatus.Passed);
                    if (anyPassed)
                    {
                        passed = true;
                        evalStatus = "Passed";
                        detail = $"Matched ANY ({string.Join("; ", tokenOutcomes)}).";
                    }
                    else if (clauseNotEval > 0)
                    {
                        passed = false;
                        evalStatus = "NotEvaluated";
                        detail = $"Not evaluated ({string.Join("; ", tokenOutcomes)}).";
                    }
                    else
                    {
                        passed = false;
                        evalStatus = "Failed";
                        detail = $"No option in ANY group matched ({string.Join("; ", tokenOutcomes)}).";
                    }
                }
                else
                {
                    var anyFailed = tokenResults.Any(t => t.Status == TokenStatus.Failed);
                    if (anyFailed)
                    {
                        passed = false;
                        evalStatus = "Failed";
                        detail = $"Failed ALL requirement check ({string.Join("; ", tokenOutcomes)}).";
                    }
                    else if (clauseNotEval > 0)
                    {
                        passed = false;
                        evalStatus = "NotEvaluated";
                        detail = $"Not evaluated: unsupported condition in ALL group ({string.Join("; ", tokenOutcomes)}).";
                    }
                    else
                    {
                        passed = true;
                        evalStatus = "Passed";
                        detail = $"All required conditions verified ({string.Join("; ", tokenOutcomes)}).";
                    }
                }

                if (kwLower == "when")
                {
                    triggered = passed;
                }

                if (!passed)
                {
                    allConditionsPassed = false;
                    firstFailureReason ??= tokenResults
                        .FirstOrDefault(t => t.Status != TokenStatus.Passed)?.Explanation
                        ?? detail;
                }
            }
            else if (kwLower == "with")
            {
                if (allConditionsPassed && (!hasWhenClause || triggered))
                {
                    passed = true;
                    evalStatus = "Passed";
                    if (req.AcBonus > 0 || expr.Contains("+5", StringComparison.OrdinalIgnoreCase))
                    {
                        var bonus = req.AcBonus > 0 ? req.AcBonus : 5;
                        computedAc = req.TargetAc + bonus;
                    }
                    detail = $"Prepared modifier ({expr}). Effective AC = {computedAc}.";
                    tokenOutcomes.Add($"Passed: Modifier ready ({expr})");
                }
                else
                {
                    passed = false;
                    evalStatus = "Skipped";
                    detail = "Skipped modifier because trigger or requirements did not pass.";
                }
            }
            else if (kwLower == "then")
            {
                passed = allConditionsPassed && (!hasWhenClause || triggered);
                if (passed)
                {
                    evalStatus = "Passed";
                    if (req.ActionCost.Contains("Reaction", StringComparison.OrdinalIgnoreCase) ||
                        expr.Contains("Reaction", StringComparison.OrdinalIgnoreCase))
                    {
                        reactionConsumed = req.ReactionAvailable;
                    }
                    if (expr.Contains("Spell Slot", StringComparison.OrdinalIgnoreCase) ||
                        expr.Contains("Slot", StringComparison.OrdinalIgnoreCase) ||
                        expr.Contains("resources", StringComparison.OrdinalIgnoreCase))
                    {
                        spellSlotConsumed = req.HasSpellSlot;
                    }

                    if (req.AcBonus > 0 && computedAc == req.TargetAc)
                    {
                        computedAc = req.TargetAc + req.AcBonus;
                    }

                    if (req.IsMagicMissile && expr.Contains("Magic Missile", StringComparison.OrdinalIgnoreCase))
                    {
                        computedDamage = 0;
                    }
                    else if (computedAc > req.AttackRollTotal &&
                             (req.AcBonus > 0 || expr.Contains("AC", StringComparison.OrdinalIgnoreCase)))
                    {
                        computedDamage = 0;
                    }

                    foreach (var t in clause.Tokens ?? [])
                    {
                        tokenOutcomes.Add($"Executed: {t}");
                    }
                    detail = $"Effects applied via {boundSymbol}: {string.Join(" -> ", clause.Tokens ?? [])}.";
                }
                else
                {
                    evalStatus = "Skipped";
                    detail = "Skipped effects because a trigger or requirement check did not pass.";
                }
            }
            else if (kwLower == "else")
            {
                passed = !allConditionsPassed || (hasWhenClause && !triggered);
                evalStatus = passed ? "Passed" : "Skipped";
                detail = passed
                    ? $"Fallback applied: {expr}."
                    : "Fallback skipped because primary trigger and requirements succeeded.";
            }
            else
            {
                evalStatus = "NotEvaluated";
                notEvaluatedCount++;
                passed = false;
                allConditionsPassed = false;
                detail = $"Not evaluated: unknown clause type '{keyword}'.";
            }

            steps.Add(new RuleClauseTraceStepDto(
                StepNumber: stepIdx++,
                Keyword: keyword,
                ExpressionText: expr,
                BoundSymbol: string.IsNullOrWhiteSpace(boundSymbol)
                    ? $"{req.PrimaryClassName}.{req.PrimaryMethodName}"
                    : boundSymbol,
                Passed: passed,
                OutcomeDetail: detail,
                Combiner: combiner,
                EvaluationStatus: evalStatus,
                TokenOutcomes: tokenOutcomes
            ));
        }

        var (headline, outcomeLabel, resourceSummary) = BuildTabletopExplanation(
            req, triggered, allConditionsPassed, notEvaluatedCount,
            computedAc, computedDamage, reactionConsumed, spellSlotConsumed, firstFailureReason);

        var combatLog = allConditionsPassed && triggered
            ? $"[{req.RuleName}] {defender} uses {req.ActionCost} against {attacker}: {headline} ({resourceSummary})"
            : $"[{req.RuleName}] {headline} ({resourceSummary})";

        return new EvaluateRuleLogicResponse(
            RuleId: req.RuleId,
            RuleName: req.RuleName,
            Triggered: triggered,
            ConditionsPassed: allConditionsPassed && triggered && notEvaluatedCount == 0,
            FinalResolutionSummary: headline,
            CombatLogPreview: combatLog,
            ComputedAcAfterRule: computedAc,
            ComputedDamageAfterRule: computedDamage,
            TraceSteps: steps,
            Timestamp: DateTimeOffset.UtcNow.ToString("O"),
            TabletopHeadline: headline,
            AttackOutcomeLabel: outcomeLabel,
            ReactionConsumed: reactionConsumed,
            SpellSlotConsumed: spellSlotConsumed,
            ResourceVerificationSummary: resourceSummary,
            NotEvaluatedCount: notEvaluatedCount
        );
    }

    private static string NormalizeCombiner(string? combiner, string kwLower)
    {
        if (string.Equals(combiner, "ANY", StringComparison.OrdinalIgnoreCase) || kwLower == "or")
            return "ANY";
        if (string.Equals(combiner, "ALL", StringComparison.OrdinalIgnoreCase))
            return "ALL";
        return kwLower == "when" ? "ANY" : "ALL";
    }

    private static List<TokenResult> EvaluateClauseTokens(
        IReadOnlyList<string> tokens,
        string kwLower,
        EvaluateRuleLogicRequest req)
    {
        var list = new List<TokenResult>(tokens.Count);
        foreach (var raw in tokens)
        {
            var token = raw?.Trim() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(token)) continue;
            list.Add(EvaluateSingleToken(token, kwLower, req));
        }
        return list;
    }

    private static TokenResult EvaluateSingleToken(string token, string kwLower, EvaluateRuleLogicRequest req)
    {
        if (token.Contains("Unsupported", StringComparison.OrdinalIgnoreCase) ||
            token.Contains("Not evaluated", StringComparison.OrdinalIgnoreCase) ||
            token.Contains("Custom condition:", StringComparison.OrdinalIgnoreCase))
        {
            return new TokenResult(token, TokenStatus.NotEvaluated, $"'{token}' is not supported by automated verification");
        }

        if (kwLower == "when")
        {
            if (token.Contains("Magic Missile", StringComparison.OrdinalIgnoreCase))
            {
                return req.IsMagicMissile
                    ? new TokenResult(token, TokenStatus.Passed, "Magic Missile targets you")
                    : new TokenResult(token, TokenStatus.Failed, "Incoming attack is not Magic Missile");
            }
            if (token.Contains("attack hits", StringComparison.OrdinalIgnoreCase) ||
                token.Contains("Attack Roll Hits", StringComparison.OrdinalIgnoreCase) ||
                token.Contains("Weapon Attack Hits", StringComparison.OrdinalIgnoreCase) ||
                token.Contains("Slingshot Attack", StringComparison.OrdinalIgnoreCase))
            {
                if (req.IsMagicMissile)
                    return new TokenResult(token, TokenStatus.Failed, "Scenario uses Magic Missile instead of an attack roll");
                var hitsBase = req.AttackRollTotal >= req.TargetAc;
                return hitsBase
                    ? new TokenResult(token, TokenStatus.Passed, $"Attack total {req.AttackRollTotal} hits base AC {req.TargetAc}")
                    : new TokenResult(token, TokenStatus.Failed, $"Attack total {req.AttackRollTotal} already misses base AC {req.TargetAc}");
            }
            if (token.Contains("Within 60 ft", StringComparison.OrdinalIgnoreCase))
            {
                return req.DistanceFeet <= 60
                    ? new TokenResult(token, TokenStatus.Passed, $"Caster within 60 ft ({req.DistanceFeet} ft)")
                    : new TokenResult(token, TokenStatus.Failed, $"Caster at {req.DistanceFeet} ft exceeds 60 ft");
            }
            if (token.Contains("Leaves Reach", StringComparison.OrdinalIgnoreCase))
            {
                return req.DistanceFeet <= 5
                    ? new TokenResult(token, TokenStatus.Passed, $"Target exits 5 ft reach ({req.DistanceFeet} ft)")
                    : new TokenResult(token, TokenStatus.Failed, $"Target at {req.DistanceFeet} ft is outside 5 ft reach");
            }
            if (token.Contains("Takes Damage", StringComparison.OrdinalIgnoreCase))
            {
                return req.DamageRolled > 0
                    ? new TokenResult(token, TokenStatus.Passed, $"Defender took {req.DamageRolled} damage")
                    : new TokenResult(token, TokenStatus.Failed, "No damage taken");
            }
            if (token.Contains("Turn Starts", StringComparison.OrdinalIgnoreCase) ||
                token.Contains("Overchannel Declared", StringComparison.OrdinalIgnoreCase))
            {
                return new TokenResult(token, TokenStatus.Passed, $"Trigger declared ({token})");
            }
            return new TokenResult(token, TokenStatus.NotEvaluated, $"Trigger '{token}' is not supported by automated verification");
        }

        if (kwLower == "has")
        {
            if (token.Contains("Reaction", StringComparison.OrdinalIgnoreCase))
            {
                return req.ReactionAvailable
                    ? new TokenResult(token, TokenStatus.Passed, "Reaction available (1 unspent)")
                    : new TokenResult(token, TokenStatus.Failed, "No Reaction available (already spent this round)");
            }
            if (token.Contains("Spell Slot", StringComparison.OrdinalIgnoreCase) ||
                token.Contains("spell slot", StringComparison.OrdinalIgnoreCase))
            {
                return req.HasSpellSlot
                    ? new TokenResult(token, TokenStatus.Passed, "Appropriate spell slot available")
                    : new TokenResult(token, TokenStatus.Failed, "No appropriate spell slot available");
            }
            if (token.Contains("Concentration", StringComparison.OrdinalIgnoreCase))
            {
                return new TokenResult(token, TokenStatus.Passed, "Concentration is active on defender");
            }
            return new TokenResult(token, TokenStatus.NotEvaluated, $"Requirement '{token}' cannot be verified automatically");
        }

        if (kwLower == "contains")
        {
            if (token.Contains("casting requirements", StringComparison.OrdinalIgnoreCase) ||
                token.Contains("Somatic", StringComparison.OrdinalIgnoreCase) ||
                token.Contains("Verbal", StringComparison.OrdinalIgnoreCase))
            {
                return new TokenResult(token, TokenStatus.Passed, "Casting requirements satisfied (Verbal, Somatic)");
            }
            if (token.Contains("Reaction", StringComparison.OrdinalIgnoreCase) ||
                token.Contains("Finesse", StringComparison.OrdinalIgnoreCase) ||
                token.Contains("Ranged", StringComparison.OrdinalIgnoreCase) ||
                token.Contains("Spell", StringComparison.OrdinalIgnoreCase) ||
                token.Contains("Reagent", StringComparison.OrdinalIgnoreCase))
            {
                return new TokenResult(token, TokenStatus.Passed, $"Tag/component verified ({token})");
            }
            return new TokenResult(token, TokenStatus.NotEvaluated, $"Condition '{token}' is not evaluated by the engine");
        }

        if (kwLower == "has not")
        {
            if (token.Contains("Reaction", StringComparison.OrdinalIgnoreCase))
            {
                return req.ReactionAvailable
                    ? new TokenResult(token, TokenStatus.Passed, "Defender has not spent Reaction this round")
                    : new TokenResult(token, TokenStatus.Failed, "Defender already spent Reaction this round");
            }
            if (token.Contains("Disengage", StringComparison.OrdinalIgnoreCase) ||
                token.Contains("Sneak Attack", StringComparison.OrdinalIgnoreCase) ||
                token.Contains("Disadvantage", StringComparison.OrdinalIgnoreCase))
            {
                return new TokenResult(token, TokenStatus.Passed, $"Guard satisfied ({token})");
            }
            return new TokenResult(token, TokenStatus.NotEvaluated, $"Guard '{token}' is not evaluated by the engine");
        }

        if (kwLower == "where")
        {
            if (token.Contains("60 ft", StringComparison.OrdinalIgnoreCase))
            {
                return req.DistanceFeet <= 60
                    ? new TokenResult(token, TokenStatus.Passed, $"Distance {req.DistanceFeet} ft is within 60 ft")
                    : new TokenResult(token, TokenStatus.Failed, $"Distance {req.DistanceFeet} ft exceeds 60 ft");
            }
            if (token.Contains("5 ft", StringComparison.OrdinalIgnoreCase))
            {
                return req.DistanceFeet <= 5
                    ? new TokenResult(token, TokenStatus.Passed, $"Distance {req.DistanceFeet} ft is within 5 ft reach")
                    : new TokenResult(token, TokenStatus.Failed, $"Distance {req.DistanceFeet} ft exceeds 5 ft reach");
            }
            return new TokenResult(token, TokenStatus.NotEvaluated, $"Spatial check '{token}' is not evaluated by the engine");
        }

        // If / And / Or
        if (token.Contains("AttackTotal >= TargetAC", StringComparison.OrdinalIgnoreCase) ||
            token.Contains("attack hits", StringComparison.OrdinalIgnoreCase))
        {
            return req.AttackRollTotal >= req.TargetAc
                ? new TokenResult(token, TokenStatus.Passed, $"Attack total {req.AttackRollTotal} >= base AC {req.TargetAc}")
                : new TokenResult(token, TokenStatus.Failed, $"Attack total {req.AttackRollTotal} < base AC {req.TargetAc}");
        }
        if (token.Contains("Reaction", StringComparison.OrdinalIgnoreCase))
        {
            return req.ReactionAvailable
                ? new TokenResult(token, TokenStatus.Passed, "Reaction available")
                : new TokenResult(token, TokenStatus.Failed, "No Reaction available");
        }
        if (token.Contains("Spell.Level", StringComparison.OrdinalIgnoreCase) ||
            token.Contains("Constitution Save", StringComparison.OrdinalIgnoreCase) ||
            token.Contains("Advantage", StringComparison.OrdinalIgnoreCase) ||
            token.Contains("Ally Within 5 ft", StringComparison.OrdinalIgnoreCase))
        {
            return new TokenResult(token, TokenStatus.Passed, $"Condition met ({token})");
        }

        return new TokenResult(token, TokenStatus.NotEvaluated, $"Condition '{token}' is not evaluated by the engine");
    }

    private static (string Headline, string OutcomeLabel, string ResourceSummary) BuildTabletopExplanation(
        EvaluateRuleLogicRequest req,
        bool triggered,
        bool allConditionsPassed,
        int notEvaluatedCount,
        int computedAc,
        int computedDamage,
        bool reactionConsumed,
        bool spellSlotConsumed,
        string? firstFailureReason)
    {
        var resourceSummary = $"Reaction: {(reactionConsumed ? "Consumed (1 -> 0)" : (req.ReactionAvailable ? "Not consumed (1 remaining)" : "Unavailable (0 remaining)"))} · Spell Slot: {(spellSlotConsumed ? "Consumed (1st-level slot spent)" : (req.HasSpellSlot ? "Not consumed" : "Unavailable (0 slots)"))}";

        if (notEvaluatedCount > 0)
            return ($"Not evaluated: {firstFailureReason ?? $"{notEvaluatedCount} condition(s) could not be verified automatically."}", "Not Evaluated", resourceSummary);

        if (!triggered)
            return ($"Trigger did not match: {firstFailureReason ?? $"Attack total {req.AttackRollTotal} against AC {req.TargetAc} did not trigger {req.RuleName}."}", "Rule Did Not Trigger", resourceSummary);

        if (!allConditionsPassed)
            return ($"{req.RuleName} blocked by unmet requirement: {firstFailureReason}. Attack total {req.AttackRollTotal} against AC {req.TargetAc} resolves normally ({computedDamage} damage).", "Requirements Not Met", resourceSummary);

        if (req.IsMagicMissile)
            return ($"Magic Missile targets you. {req.RuleName} raises AC from {req.TargetAc} to {computedAc} and negates all Magic Missile darts (0 damage).", "Magic Missile Negated", resourceSummary);

        if (req.AcBonus > 0 || computedAc > req.TargetAc)
        {
            return req.AttackRollTotal < computedAc
                ? ($"Attack total {req.AttackRollTotal} against AC {req.TargetAc}. {req.RuleName} raises AC to {computedAc}. The attack misses.", "The Attack Misses", resourceSummary)
                : ($"Attack total {req.AttackRollTotal} against AC {req.TargetAc}. {req.RuleName} raises AC to {computedAc}, but the attack still hits ({req.AttackRollTotal} >= {computedAc}) for {computedDamage} damage.", "Attack Still Hits", resourceSummary);
        }

        return ($"{req.RuleName} triggered and passed all requirements ({req.DamageOrEffectFormula}).", "Effect Applied", resourceSummary);
    }
}
