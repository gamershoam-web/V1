package com.aidraw.ai;

import com.google.gson.JsonObject;

/** What Claude designed for the drawing. {@code raw} is the full validated-by-schema JSON answer. */
public record DrawingResult(String category, String name, String description, String vanillaId, String mobId,
                            int count, int attackDamage, JsonObject raw) {}
