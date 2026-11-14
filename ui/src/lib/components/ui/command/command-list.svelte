<script lang="ts">
	import { Command as CommandPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: CommandPrimitive.ListProps = $props();
</script>

<CommandPrimitive.List
	bind:ref
	data-slot="command-list"
	class={cn(
		"scroll-thin max-h-72 scroll-py-1 py-1 pr-1 pl-2.5 outline-none overflow-x-hidden overflow-y-auto",
		className
	)}
	{...restProps}
/>
