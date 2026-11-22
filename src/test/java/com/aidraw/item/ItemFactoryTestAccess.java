package com.aidraw.item;

import com.aidraw.ai.AiConfig;

public class ItemFactoryTestAccess {
    public static java.util.Optional<ItemFactory.Outcome> vanilla(String id, int c) { return ItemFactory.vanilla(id, c, AiConfig.get()); }
    public static String effect(String id) { return ItemFactory.validEffect(id); }
}
