using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using SuccessionOS.Domain.Entities;

namespace SuccessionOS.Infrastructure.Data;

public class SuccessionDbContext(DbContextOptions<SuccessionDbContext> options) : DbContext(options)
{
    public DbSet<EmployeeExtension> EmployeeExtensions => Set<EmployeeExtension>();
    public DbSet<KeyPosition>       KeyPositions       => Set<KeyPosition>();
    public DbSet<SuccessionPlan>    SuccessionPlans    => Set<SuccessionPlan>();
    public DbSet<IdpPlan>           IdpPlans           => Set<IdpPlan>();
    public DbSet<IdpPlanDetail>     IdpPlanDetails     => Set<IdpPlanDetail>();
    public DbSet<CareerReview>      CareerReviews      => Set<CareerReview>();
    public DbSet<CurrentProject>    CurrentProjects    => Set<CurrentProject>();
    public DbSet<KnowledgeTransfer> KnowledgeTransfers => Set<KnowledgeTransfer>();
    public DbSet<Assessment360>     Assessments360     => Set<Assessment360>();

    private static string Json<T>(T v) =>
        System.Text.Json.JsonSerializer.Serialize(v, (System.Text.Json.JsonSerializerOptions?)null);

    private static List<T> FromJson<T>(string v) =>
        System.Text.Json.JsonSerializer.Deserialize<List<T>>(v, (System.Text.Json.JsonSerializerOptions?)null) ?? new();

    /// Comparer for List<T> stored as JSON — compares by serialized value.
    private static ValueComparer<List<T>> ListComparer<T>() => new(
        (a, b) => Json(a) == Json(b),
        c => Json(c).GetHashCode(),
        c => FromJson<T>(Json(c)));

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // ── EmployeeExtension ────────────────────────────────────────────────
        modelBuilder.Entity<EmployeeExtension>(b =>
        {
            b.HasKey(e => e.VnrProfileId);
            b.OwnsOne(e => e.Competencies, nav => nav.ToJson());
            b.Property(e => e.RiskReasons)
             .HasConversion(v => Json(v), v => FromJson<string>(v))
             .Metadata.SetValueComparer(ListComparer<string>());
        });

        // ── KeyPosition ──────────────────────────────────────────────────────
        modelBuilder.Entity<KeyPosition>(b =>
        {
            b.HasKey(p => p.Id);
            b.Property(p => p.RequiredCompetencies)
             .HasConversion(v => Json(v), v => FromJson<string>(v))
             .Metadata.SetValueComparer(ListComparer<string>());
            b.Property(p => p.SuccessorIds)
             .HasConversion(v => Json(v), v => FromJson<string>(v))
             .Metadata.SetValueComparer(ListComparer<string>());
        });

        // ── SuccessionPlan ───────────────────────────────────────────────────
        modelBuilder.Entity<SuccessionPlan>(b =>
        {
            b.HasKey(p => p.Id);
            b.OwnsMany(p => p.Successors, nav => nav.ToJson());
        });

        // ── CareerReview ─────────────────────────────────────────────────────
        modelBuilder.Entity<CareerReview>(b =>
        {
            b.HasKey(r => r.Id);
            b.OwnsMany(r => r.Categories, nav => nav.ToJson());
            b.Property(r => r.Strengths)
             .HasConversion(v => Json(v), v => FromJson<string>(v))
             .Metadata.SetValueComparer(ListComparer<string>());
            b.Property(r => r.NeedsDev)
             .HasConversion(v => Json(v), v => FromJson<string>(v))
             .Metadata.SetValueComparer(ListComparer<string>());
        });

        // ── CurrentProject ───────────────────────────────────────────────────
        modelBuilder.Entity<CurrentProject>(b => b.HasKey(p => p.Id));

        // ── KnowledgeTransfer ────────────────────────────────────────────────
        modelBuilder.Entity<KnowledgeTransfer>(b =>
        {
            b.HasKey(k => k.Id);
            b.OwnsMany(k => k.Items, nav => nav.ToJson());
        });

        // ── Assessment360 ────────────────────────────────────────────────────
        modelBuilder.Entity<Assessment360>(b =>
        {
            b.HasKey(a => a.Id);
            b.OwnsMany(a => a.Sources, nav => nav.ToJson());
            b.OwnsMany(a => a.Criteria, nav => nav.ToJson());
            b.Property(a => a.Strengths)
             .HasConversion(v => Json(v), v => FromJson<string>(v))
             .Metadata.SetValueComparer(ListComparer<string>());
            b.Property(a => a.NeedsDev)
             .HasConversion(v => Json(v), v => FromJson<string>(v))
             .Metadata.SetValueComparer(ListComparer<string>());
        });

        // ── IdpPlanDetail ────────────────────────────────────────────────────
        // IdpGoal has an explicit Id — cannot use OwnsMany().ToJson() with explicit key.
        // Store the whole Goals list as a JSON string column instead.
        modelBuilder.Entity<IdpPlanDetail>(b =>
        {
            b.HasKey(i => i.Id);
            b.Property(i => i.Goals12m)
             .HasConversion(v => Json(v), v => FromJson<string>(v))
             .Metadata.SetValueComparer(ListComparer<string>());
            b.Property(i => i.Goals2to3y)
             .HasConversion(v => Json(v), v => FromJson<string>(v))
             .Metadata.SetValueComparer(ListComparer<string>());
            b.Property(i => i.Goals)
             .HasConversion(v => Json(v), v => FromJson<IdpGoal>(v))
             .Metadata.SetValueComparer(ListComparer<IdpGoal>());
        });
    }
}
